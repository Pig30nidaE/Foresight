"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { saveMyAnalyzedGame } from "@/features/user-profile/api";
import { streamGameAnalysis } from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import type {
  AnalyzedMove,
  AnalysisSSEEvent,
  BothPlayersAnalysis,
  MoveTier,
  PlayerAnalysis,
} from "@/shared/types";

// ── Types ──────────────────────────────────────────────────────────

export type QueueItemStatus = "queued" | "analyzing" | "complete" | "error";

export interface QueueItem {
  id: string;
  gameId: string;
  pgn: string;
  depth: number;
  label: string;
  dashboardHref?: string;
  status: QueueItemStatus;
  progress: number;
  totalMoves: number;
  moves: AnalyzedMove[];
  result: BothPlayersAnalysis | null;
  error: string | null;
}

type PersistedCompletedAnalysis = {
  gameId: string;
  depth: number;
  label: string;
  dashboardHref?: string;
  result: BothPlayersAnalysis;
};

const ANALYSIS_RESULT_CACHE_KEY_PREFIX = "foresight.analysis.result-cache";
const ANALYSIS_RESULT_CACHE_LIMIT = 8;

function buildAnalysisResultCacheKey(userKey: string): string {
  return `${ANALYSIS_RESULT_CACHE_KEY_PREFIX}.${encodeURIComponent(userKey)}`;
}

type SessionWithProvider = Session & {
  provider?: string;
  providerAccountId?: string;
};

/** 로그인한 계정별로 큐를 분리하기 위한 안정 키 (다른 사용자·다른 브라우저와 무관, 탭 내 계정 단위) */
export function computeAnalysisQueueUserKey(session: Session | null): string | null {
  if (!session?.user) return null;
  const s = session as SessionWithProvider;
  if (s.provider && s.providerAccountId) {
    return `${s.provider}:${s.providerAccountId}`;
  }
  if (session.user.id) {
    return `id:${session.user.id}`;
  }
  if (session.user.email) {
    return `email:${session.user.email}`;
  }
  return null;
}

// ── Result builder ─────────────────────────────────────────────────

function buildResult(
  moves: AnalyzedMove[],
  completeEvent: AnalysisSSEEvent & { type: "complete" },
): BothPlayersAnalysis {
  const whiteMoves = moves.filter((m) => m.color === "white");
  const blackMoves = moves.filter((m) => m.color === "black");

  const buildPlayer = (
    summary: {
      username: string;
      color: string;
      total_moves: number;
      accuracy: number;
      avg_cp_loss: number;
      tier_counts: Record<string, number>;
      tier_percentages: Record<string, number>;
    },
    playerMoves: AnalyzedMove[],
  ): PlayerAnalysis => {
    const movesByTier = {} as Record<MoveTier, AnalyzedMove[]>;
    for (const m of playerMoves) {
      if (!movesByTier[m.tier]) movesByTier[m.tier] = [];
      movesByTier[m.tier].push(m);
    }
    return {
      username: summary.username,
      color: summary.color as "white" | "black",
      total_moves: summary.total_moves,
      analyzed_moves: playerMoves,
      tier_counts: summary.tier_counts as Record<MoveTier, number>,
      tier_percentages: summary.tier_percentages as Record<MoveTier, number>,
      avg_cp_loss: summary.avg_cp_loss,
      accuracy: summary.accuracy,
      moves_by_tier: movesByTier,
    };
  };

  return {
    game_id: completeEvent.game_id,
    white_player: completeEvent.white.username,
    black_player: completeEvent.black.username,
    white_analysis: buildPlayer(completeEvent.white, whiteMoves),
    black_analysis: buildPlayer(completeEvent.black, blackMoves),
    opening: completeEvent.opening as BothPlayersAnalysis["opening"],
  };
}

// ── Per-user store ─────────────────────────────────────────────────

type Listener = () => void;

class AnalysisQueueStore {
  private readonly cacheStorageKey: string;
  private items: QueueItem[] = [];
  private completedByGameId = new Map<string, QueueItem>();
  private listeners = new Set<Listener>();
  private abortMap = new Map<string, AbortController>();
  private processing = false;

  constructor(cacheStorageKey: string) {
    this.cacheStorageKey = cacheStorageKey;
    this.loadCompletedCache();
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): QueueItem[] => this.items;

  getLatestCompleted(gameId: string): QueueItem | undefined {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      if (item.gameId === gameId && item.status === "complete" && item.result) {
        return item;
      }
    }
    return this.completedByGameId.get(gameId);
  }

  private loadCompletedCache() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(this.cacheStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedCompletedAnalysis[];
      if (!Array.isArray(parsed)) return;

      for (const entry of parsed) {
        if (
          !entry
          || typeof entry.gameId !== "string"
          || typeof entry.depth !== "number"
          || typeof entry.label !== "string"
          || !entry.result
        ) {
          continue;
        }
        this.completedByGameId.set(entry.gameId, {
          id: `${entry.gameId}__cached`,
          gameId: entry.gameId,
          pgn: "",
          depth: entry.depth,
          label: entry.label,
          dashboardHref: entry.dashboardHref,
          status: "complete",
          progress: 0,
          totalMoves: 0,
          moves: [],
          result: entry.result,
          error: null,
        });
      }
    } catch {
      // Ignore broken cache payloads.
    }
  }

  private persistCompletedCache() {
    if (typeof window === "undefined") return;
    try {
      const entries = Array.from(this.completedByGameId.values())
        .reverse()
        .slice(0, ANALYSIS_RESULT_CACHE_LIMIT)
        .map((item) => {
          if (!item.result) return null;
          return {
            gameId: item.gameId,
            depth: item.depth,
            label: item.label,
            dashboardHref: item.dashboardHref,
            result: item.result,
          } satisfies PersistedCompletedAnalysis;
        })
        .filter((v): v is PersistedCompletedAnalysis => v !== null);

      window.localStorage.setItem(this.cacheStorageKey, JSON.stringify(entries));
    } catch {
      // Ignore quota failures and keep runtime state only.
    }
  }

  private cacheCompletedItem(item: QueueItem) {
    this.completedByGameId.delete(item.gameId);
    this.completedByGameId.set(item.gameId, item);
    while (this.completedByGameId.size > ANALYSIS_RESULT_CACHE_LIMIT) {
      const oldestKey = this.completedByGameId.keys().next().value;
      if (!oldestKey) break;
      this.completedByGameId.delete(oldestKey);
    }
    this.persistCompletedCache();
  }

  /** 로그아웃·계정 전환 시: 진행 중 fetch 전부 중단 + 큐 비우기 (다른 유저 스토어는 건드리지 않음) */
  abortAllAndClear() {
    for (const ctrl of this.abortMap.values()) {
      ctrl.abort();
    }
    this.abortMap.clear();
    this.items = [];
    this.processing = false;
    this.emit();
  }

  private updateItem(id: string, patch: Partial<QueueItem>) {
    if (!this.items.some((i) => i.id === id)) return;
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    this.emit();
  }

  private async persistCompletedItem(item: QueueItem) {
    try {
      const token = await getBackendJwt();
      if (!token) return;
      await saveMyAnalyzedGame(token, {
        game_id: item.gameId,
        label: item.label,
        depth: item.depth,
        dashboard_href: item.dashboardHref ?? null,
      });
    } catch {
      // Keep queue UX stable even if persistence fails.
    }
  }

  enqueue(gameId: string, pgn: string, depth: number, label: string, dashboardHref?: string) {
    const id = `${gameId}__d${depth}`;
    if (this.items.some((i) => i.id === id)) return;
    this.items = [
      ...this.items,
      {
        id,
        gameId,
        pgn,
        depth,
        label,
        dashboardHref,
        status: "queued",
        progress: 0,
        totalMoves: 0,
        moves: [],
        result: null,
        error: null,
      },
    ];
    this.emit();
    this.processNext();
  }

  remove(id: string) {
    const ctrl = this.abortMap.get(id);
    if (ctrl) {
      ctrl.abort();
      this.abortMap.delete(id);
      const wasProcessing = this.items.find((i) => i.id === id)?.status === "analyzing";
      this.items = this.items.filter((i) => i.id !== id);
      this.emit();
      if (wasProcessing) {
        this.processing = false;
        this.processNext();
      }
    } else {
      this.items = this.items.filter((i) => i.id !== id);
      this.emit();
    }
  }

  clearCompleted() {
    this.items = this.items.filter((i) => i.status !== "complete");
    this.emit();
  }

  private async processNext() {
    if (this.processing) return;
    const next = this.items.find((i) => i.status === "queued");
    if (!next) return;

    this.processing = true;
    this.updateItem(next.id, { status: "analyzing" });

    const ctrl = new AbortController();
    this.abortMap.set(next.id, ctrl);
    const collectedMoves: AnalyzedMove[] = [];
    let currentTotal = 0;

    try {
      for await (const event of streamGameAnalysis(next.pgn, next.gameId, next.depth, ctrl.signal)) {
        if (ctrl.signal.aborted) break;
        switch (event.type) {
          case "init":
            currentTotal = event.total_moves;
            this.updateItem(next.id, { progress: 0, totalMoves: currentTotal });
            break;
          case "move": {
            const half = event.data.halfmove;
            const idx = collectedMoves.findIndex((m) => m.halfmove === half);
            if (idx >= 0) {
              collectedMoves[idx] = event.data;
            } else {
              collectedMoves.push(event.data);
            }
            this.updateItem(next.id, {
              progress: collectedMoves.length,
              totalMoves: currentTotal,
              moves: [...collectedMoves],
            });
            break;
          }
          case "complete": {
            const result = buildResult(collectedMoves, event);
            const completedItem: QueueItem = {
              ...next,
              status: "complete",
              result,
              moves: [...collectedMoves],
              progress: collectedMoves.length,
              totalMoves: currentTotal,
              error: null,
            };
            this.updateItem(next.id, {
              status: completedItem.status,
              result: completedItem.result,
              moves: completedItem.moves,
              progress: completedItem.progress,
              totalMoves: completedItem.totalMoves,
              error: completedItem.error,
            });
            this.cacheCompletedItem(completedItem);
            void this.persistCompletedItem(next);
            break;
          }
          case "error":
            this.updateItem(next.id, { status: "error", error: event.message });
            break;
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        this.updateItem(next.id, { status: "error", error: String(err) });
      }
    } finally {
      this.abortMap.delete(next.id);
      this.processing = false;
      this.processNext();
    }
  }
}

const storeByUserKey = new Map<string, AnalysisQueueStore>();

function getOrCreateStore(userKey: string): AnalysisQueueStore {
  let s = storeByUserKey.get(userKey);
  if (!s) {
    s = new AnalysisQueueStore(buildAnalysisResultCacheKey(userKey));
    storeByUserKey.set(userKey, s);
  }
  return s;
}

/** 해당 로그인 키의 대기열만 중단·삭제 (다른 userKey 스토어는 유지) */
export function disposeAnalysisQueueForUserKey(userKey: string) {
  const s = storeByUserKey.get(userKey);
  if (!s) return;
  s.abortAllAndClear();
  storeByUserKey.delete(userKey);
}

const EMPTY_ITEMS: QueueItem[] = [];

function subscribeNothing(_onStoreChange: () => void) {
  return () => {};
}

function getEmptyItems() {
  return EMPTY_ITEMS;
}

// ── Context ────────────────────────────────────────────────────────

interface AnalysisQueueContextValue {
  items: QueueItem[];
  enqueue: (gameId: string, pgn: string, depth: number, label: string, dashboardHref?: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  getItem: (gameId: string, depth: number) => QueueItem | undefined;
  getLatestCompleted: (gameId: string) => QueueItem | undefined;
}

const AnalysisQueueContext = createContext<AnalysisQueueContextValue | null>(null);

export function AnalysisQueueProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userKey = status === "authenticated" ? computeAnalysisQueueUserKey(session) : null;
  const prevUserKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevUserKeyRef.current;
    if (prev && prev !== userKey) {
      disposeAnalysisQueueForUserKey(prev);
    }
    prevUserKeyRef.current = userKey;
  }, [userKey]);

  const store = userKey ? getOrCreateStore(userKey) : null;

  const items = useSyncExternalStore(
    store ? store.subscribe : subscribeNothing,
    store ? store.getSnapshot : getEmptyItems,
    store ? store.getSnapshot : getEmptyItems,
  );

  const enqueue = useCallback(
    (gameId: string, pgn: string, depth: number, label: string, dashboardHref?: string) => {
      if (!userKey) return;
      getOrCreateStore(userKey).enqueue(gameId, pgn, depth, label, dashboardHref);
    },
    [userKey],
  );

  const remove = useCallback(
    (id: string) => {
      if (!userKey) return;
      getOrCreateStore(userKey).remove(id);
    },
    [userKey],
  );

  const clearCompleted = useCallback(() => {
    if (!userKey) return;
    getOrCreateStore(userKey).clearCompleted();
  }, [userKey]);

  const getItem = useCallback(
    (gameId: string, depth: number): QueueItem | undefined =>
      items.find((i) => i.gameId === gameId && i.depth === depth),
    [items],
  );

  const getLatestCompleted = useCallback(
    (gameId: string): QueueItem | undefined => {
      if (!store) return undefined;
      return store.getLatestCompleted(gameId);
    },
    [store, items],
  );

  return (
    <AnalysisQueueContext.Provider value={{ items, enqueue, remove, clearCompleted, getItem, getLatestCompleted }}>
      {children}
    </AnalysisQueueContext.Provider>
  );
}

export function useAnalysisQueue() {
  const ctx = useContext(AnalysisQueueContext);
  if (!ctx) throw new Error("useAnalysisQueue must be used within AnalysisQueueProvider");
  return ctx;
}
