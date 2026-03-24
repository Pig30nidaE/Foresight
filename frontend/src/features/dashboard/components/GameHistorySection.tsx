"use client";

import { useState, useReducer, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { getRecentGamesList } from "../api";
import { streamGameAnalysis } from "@/shared/lib/api";
import type { GameSummaryItem } from "../types";
import type { Platform, TimeClass, BothPlayersAnalysis, PlayerAnalysis, MoveTier, AnalyzedMove, AnalysisSSEEvent } from "@/shared/types";

// 도넛 차트 컴포넌트 import
import TierDonutChart from "./charts/TierDonutChart";
// 체스보드 컴포넌트 import
import ChessBoard from "./ChessBoard";
import { useTranslation, I18nKey } from "@/shared/lib/i18n";
import { useSettings } from "@/shared/components/settings/SettingsContext";
import {
  PixelCaretDownGlyph,
  PixelCaretLeftGlyph,
  PixelCaretRightGlyph,
  PixelChartGlyph,
  PixelCheckGlyph,
  PixelInboxGlyph,
  PixelKingBlackGlyph,
  PixelKingWhiteGlyph,
  PixelLinkGlyph,
  PixelPawnGlyph,
  PixelTargetGlyph,
  PixelWarnGlyph,
  PixelXGlyph,
  PixelHourglassGlyph,
} from "@/shared/components/ui/PixelGlyphs";

// ─────────────────────────────────────────────
// PGN 파서 유틸
// ─────────────────────────────────────────────
function parsePgnHeader(pgn: string, key: string): string | null {
  const m = pgn.match(new RegExp(`\\[${key} "([^"]+)"\\]`));
  return m ? m[1] : null;
}

function getMoveCount(pgn: string): number | null {
  const m = pgn?.match(/\d+\.\s/g);
  return m ? m.length : null;
}

function getTerminationKey(pgn: string, platform: string): I18nKey | null {
  const term = parsePgnHeader(pgn, "Termination");
  if (!term) return null;
  const t = term.toLowerCase();
  if (t.includes("checkmate"))        return "term.checkmate";
  if (t.includes("resignation"))      return "term.resignation";
  if (t.includes("time"))             return "term.timeout";
  if (t.includes("stalemate"))        return "term.stalemate";
  if (t.includes("repetition"))       return "term.repetition";
  if (t.includes("insufficient"))     return "term.insufficient";
  if (t.includes("50") || t.includes("fifty")) return "term.fifty";
  if (t.includes("agreed") || t.includes("draw")) return "term.agreed";
  if (t.includes("abandoned"))        return "term.abandoned";
  // lichess  "Normal" 은 그냥 제외
  if (t === "normal")                 return null;
  return null;
}

function getGameLengthLabelKey(moves: number): I18nKey {
  if (moves < 15) return "utils.veryShort";
  if (moves < 25) return "utils.short";
  if (moves < 40) return "utils.mid";
  if (moves < 60) return "utils.long";
  return "utils.veryLong";
}

function getTimeControl(pgn: string, language: "ko" | "en" = "ko"): string | null {
  const tc = parsePgnHeader(pgn, "TimeControl");
  if (!tc || tc === "-") return null;
  // "600+5" → "10min +5s" / "10분 +5초"
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return tc;
  const base = parseInt(m[1]);
  const inc  = m[2] ? parseInt(m[2]) : 0;
  const mins = Math.floor(base / 60);
  const secs = base % 60;
  if (language === "en") {
    const baseStr = mins > 0 ? `${mins}min${secs > 0 ? ` ${secs}s` : ""}` : `${secs}s`;
    return inc > 0 ? `${baseStr} +${inc}s` : baseStr;
  }
  const baseStr = mins > 0 ? `${mins}분${secs > 0 ? ` ${secs}초` : ""}` : `${secs}초`;
  return inc > 0 ? `${baseStr} +${inc}초` : baseStr;
}

// ─────────────────────────────────────────────
// 결과 배지 - 더 시각적으로 개선
// ─────────────────────────────────────────────
function ResultBadge({
  result,
  size = "md",
  t,
}: {
  result: GameSummaryItem["result"];
  size?: "sm" | "md" | "lg";
  t: (key: I18nKey) => string;
}) {
  const map = {
    win: {
      labelKey: "gh.summary.win",
      cls:
        "border border-chess-win/40 bg-chess-win/12 text-chess-win shadow-sm dark:bg-chess-win/16 dark:border-chess-win/35",
    },
    loss: {
      labelKey: "gh.summary.loss",
      cls:
        "border border-chess-loss/40 bg-chess-loss/10 text-chess-loss shadow-sm dark:bg-chess-loss/14 dark:border-chess-loss/35",
    },
    draw: {
      labelKey: "gh.summary.draw",
      cls:
        "border border-amber-600/35 bg-amber-100/80 text-amber-950 shadow-sm dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-500/35",
    },
  } as const;
  const sz = { sm: "w-7 h-7 text-xs", md: "w-8 h-8 text-sm", lg: "w-10 h-10 text-base" };
  const { labelKey, cls } = map[result];
  return (
    <div className={`inline-flex items-center justify-center rounded-lg font-bold border shadow-sm ${cls} ${sz[size]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      <span className="ml-1 leading-none opacity-100">{t(labelKey as I18nKey)}</span>
    </div>
  );
}

function toAnalysisUrl(url: string | null, platform: string, gameId: string): string | null {
  if (!url) return null;
  if (platform !== "chess.com") return url;
  if (url.includes("/analysis/game/")) return url;
  const m = url.match(/(\d{6,})/);
  const id = m?.[1] ?? gameId;
  if (!id) return url;
  return `https://www.chess.com/analysis/game/live/${id}/analysis`;
}

// ─────────────────────────────────────────────
// SSE 스트리밍 분석 훅
// ─────────────────────────────────────────────

type StreamStatus = "idle" | "queued" | "streaming" | "complete" | "error";

interface StreamState {
  status: StreamStatus;
  totalMoves: number;
  currentMove: number;
  moves: AnalyzedMove[];
  result: BothPlayersAnalysis | null;
  error: string | null;
}

type StreamAction =
  | { type: "START" }
  | { type: "QUEUED" }
  | { type: "INIT"; payload: { total_moves: number; white_player: string; black_player: string; opening?: Record<string, unknown> } }
  | { type: "MOVE"; payload: AnalyzedMove }
  | { type: "COMPLETE"; payload: AnalysisSSEEvent & { type: "complete" } }
  | { type: "ERROR"; payload: string }
  | { type: "RESET" };

const streamInitialState: StreamState = {
  status: "idle",
  totalMoves: 0,
  currentMove: 0,
  moves: [],
  result: null,
  error: null,
};

function buildAnalysisResult(
  state: { moves: AnalyzedMove[] },
  completeEvent: AnalysisSSEEvent & { type: "complete" },
): BothPlayersAnalysis {
  const whiteMoves = state.moves.filter((m) => m.color === "white");
  const blackMoves = state.moves.filter((m) => m.color === "black");

  const buildPlayer = (
    summary: { username: string; color: string; total_moves: number; accuracy: number; avg_cp_loss: number; tier_counts: Record<string, number>; tier_percentages: Record<string, number> },
    moves: AnalyzedMove[],
  ): PlayerAnalysis => {
    const movesByTier: Record<MoveTier, AnalyzedMove[]> = {} as Record<MoveTier, AnalyzedMove[]>;
    for (const m of moves) {
      if (!movesByTier[m.tier]) movesByTier[m.tier] = [];
      movesByTier[m.tier].push(m);
    }
    return {
      username: summary.username,
      color: summary.color as "white" | "black",
      total_moves: summary.total_moves,
      analyzed_moves: moves,
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

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "START":
      return { ...streamInitialState, status: "queued" };
    case "QUEUED":
      return { ...state, status: "queued" };
    case "INIT":
      return { ...state, status: "streaming", totalMoves: action.payload.total_moves, currentMove: 0, moves: [] };
    case "MOVE": {
      const half = action.payload.halfmove;
      const idx = state.moves.findIndex((m) => m.halfmove === half);
      if (idx >= 0) {
        const nextMoves = [...state.moves];
        nextMoves[idx] = action.payload;
        return { ...state, moves: nextMoves };
      }
      return { ...state, currentMove: state.currentMove + 1, moves: [...state.moves, action.payload] };
    }
    case "COMPLETE": {
      const result = buildAnalysisResult(state, action.payload);
      return { ...state, status: "complete", result };
    }
    case "ERROR":
      return { ...state, status: "error", error: action.payload };
    case "RESET":
      return streamInitialState;
    default:
      return state;
  }
}

function useAnalysisStream(
  pgn: string | null | undefined,
  gameId: string,
  depth: number,
) {
  const [state, dispatch] = useReducer(streamReducer, streamInitialState);
  const abortRef = useRef<AbortController | null>(null);
  const prevDepthRef = useRef<number | null>(null);

  // 설정에서 Depth가 바뀌면 이전 분석 결과는 무효 → 중단 후 초기화
  useEffect(() => {
    if (prevDepthRef.current === null) {
      prevDepthRef.current = depth;
      return;
    }
    if (prevDepthRef.current !== depth) {
      prevDepthRef.current = depth;
      abortRef.current?.abort();
      dispatch({ type: "RESET" });
    }
  }, [depth]);

  const start = useCallback(() => {
    if (!pgn) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ type: "START" });

    (async () => {
      try {
        for await (const event of streamGameAnalysis(pgn, gameId, depth, ctrl.signal)) {
          if (ctrl.signal.aborted) break;
          switch (event.type) {
            case "queued":
              dispatch({ type: "QUEUED" });
              break;
            case "init":
              dispatch({ type: "INIT", payload: event });
              break;
            case "move":
              dispatch({ type: "MOVE", payload: event.data });
              break;
            case "complete":
              dispatch({ type: "COMPLETE", payload: event });
              break;
            case "error":
              dispatch({ type: "ERROR", payload: event.message });
              break;
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        dispatch({ type: "ERROR", payload: String(err) });
      }
    })();
  }, [pgn, gameId, depth]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // 탭/창 닫기·뒤로가기 시 fetch가 중단되도록 pagehide + 언마운트 시 abort
  useEffect(() => {
    const abortOnHide = () => {
      abortRef.current?.abort();
    };
    window.addEventListener("pagehide", abortOnHide);
    return () => {
      window.removeEventListener("pagehide", abortOnHide);
      abortRef.current?.abort();
    };
  }, []);

  return { ...state, start, abort };
}

// ─────────────────────────────────────────────
// 게임 카드 - 시각적으로 개선 + 게임 분석 기능
// ─────────────────────────────────────────────
function GameCard({ game, username }: { game: GameSummaryItem; username: string }) {
  const { t, language } = useTranslation();
  const { stockfishDepth } = useSettings();
  const [open, setOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedTier, setSelectedTier] = useState<MoveTier | "all">("all");
  const [selectedMove, setSelectedMove] = useState<AnalyzedMove | null>(null);

  const stream = useAnalysisStream(game.pgn, game.game_id, stockfishDepth);
  const analysisData = stream.result;
  const isAnalyzing = stream.status === "queued" || stream.status === "streaming";
  const isAnalysisError = stream.status === "error";
  const isAnalyzedAtCurrentDepth = stream.status === "complete" && !!analysisData;

  const prevDepthUi = useRef(stockfishDepth);
  useEffect(() => {
    if (prevDepthUi.current !== stockfishDepth) {
      prevDepthUi.current = stockfishDepth;
      setSelectedMove(null);
      setSelectedTier("all");
    }
  }, [stockfishDepth]);

  useEffect(() => {
    if (!analysisData || selectedMove) return;
    const combined = [
      ...(analysisData.white_analysis.analyzed_moves ?? []),
      ...(analysisData.black_analysis.analyzed_moves ?? []),
    ].sort((a, b) => a.halfmove - b.halfmove);
    if (combined.length > 0) setSelectedMove(combined[0]);
  }, [analysisData, selectedMove]);

  const isWhite = game.white.toLowerCase() === username.toLowerCase();
  const myColor  = isWhite ? t("gh.card.white") : t("gh.card.black");
  const MyKingGlyph   = isWhite ? PixelKingWhiteGlyph : PixelKingBlackGlyph;
  const OppKingGlyph  = isWhite ? PixelKingBlackGlyph : PixelKingWhiteGlyph;
  const opponent = isWhite ? game.black : game.white;

  const myRating  = isWhite ? game.rating_white  : game.rating_black;
  const oppRating = isWhite ? game.rating_black  : game.rating_white;
  const ratingDiff = (myRating != null && oppRating != null) ? myRating - oppRating : null;

  const locale = language === "en" ? "en-US" : "ko-KR";
  const dateStr = game.played_at
    ? new Date(game.played_at).toLocaleDateString(locale, { year: "2-digit", month: "2-digit", day: "2-digit" })
    : "—";
  const timeStr = game.played_at
    ? new Date(game.played_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : "";

  const pgn = game.pgn ?? "";
  const moveCount  = getMoveCount(pgn);
  const terminationKey = getTerminationKey(pgn, game.platform);
  const timeControl = getTimeControl(pgn, language as "ko" | "en");
  const lengthLabel = moveCount != null ? t(getGameLengthLabelKey(moveCount)) : null;

  const resultColor = {
    win: "text-chess-win",
    loss: "text-chess-loss",
    draw: "text-amber-950 dark:text-amber-300",
  }[game.result];

  const resultLabel = { win: t("gh.card.win"), loss: t("gh.card.loss"), draw: t("gh.card.draw") }[game.result];

  /** 펼침: 단색 틴트 (픽셀 UI — 그라데이션 없음) */
  const resultOpenShell = {
    win:
      "border-2 border-emerald-700/40 dark:border-emerald-500/35 bg-emerald-50/55 dark:bg-emerald-950/22",
    loss:
      "border-2 border-rose-700/40 dark:border-rose-500/35 bg-rose-50/50 dark:bg-rose-950/20",
    draw:
      "border-2 border-amber-700/45 dark:border-amber-500/35 bg-amber-50/60 dark:bg-amber-950/18",
  }[game.result];

  const resultOpenBand = {
    win: "bg-emerald-50/50 dark:bg-emerald-950/18",
    loss: "bg-rose-50/45 dark:bg-rose-950/15",
    draw: "bg-amber-50/55 dark:bg-amber-950/14",
  }[game.result];

  /** 접힘: 종이 카드 + 아주 옅은 결과 악센트 */
  const resultCollapsedAccent = {
    win: "border-l-[2px] border-l-emerald-800/22 dark:border-l-emerald-500/28",
    loss: "border-l-[2px] border-l-rose-800/25 dark:border-l-red-500/28",
    draw: "border-l-[2px] border-l-amber-800/22 dark:border-l-amber-500/28",
  }[game.result];

  const collapsedShell =
    "border-2 border-chess-border/65 dark:border-chess-border/50 " +
    resultCollapsedAccent +
    " bg-chess-bg/95 dark:bg-chess-elevated/14 " +
    "rounded-[var(--pixel-radius)] transition-all hover:brightness-[1.015]";

  return (
    <div
      className={`overflow-hidden transition-all duration-300 rounded-[var(--pixel-radius)] ${
        open ? resultOpenShell : collapsedShell
      }`}
    >
      {/* ── 헤더 ── */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={`w-full p-3 sm:p-4 transition-all duration-200 text-left ${
          open
            ? "bg-chess-surface/25 dark:bg-chess-elevated/20"
            : "bg-transparent hover:bg-chess-surface/35 dark:hover:bg-chess-elevated/22"
        }`}
      >
        <div className="flex items-center gap-2.5 sm:gap-4">
          <ResultBadge result={game.result} size="lg" t={t} />

          {/* 메인 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1.5 flex-wrap">
              <span className={`text-base sm:text-lg font-bold ${resultColor}`}>{resultLabel}</span>
              {ratingDiff !== null && (
                <span className={`text-xs sm:text-sm font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 border-2 bg-chess-bg/60 ${
                  ratingDiff > 0
                    ? "text-chess-win border-chess-win/45 dark:border-chess-win/35"
                    : ratingDiff < 0
                      ? "text-chess-loss border-chess-loss/45 dark:border-chess-loss/35"
                      : "text-chess-primary border-chess-border/65 dark:border-chess-border/50"
                }`}>
                  {ratingDiff > 0 ? "+" : ""}{ratingDiff}
                </span>
              )}
            </div>

            <div className="space-y-0.5 sm:space-y-1">
              <p className="text-sm sm:text-base font-semibold text-chess-primary truncate leading-tight">
                {game.opening_name ?? game.opening_eco ?? t("gh.card.noOpening")}
              </p>
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-chess-muted flex-wrap">
                <span className="flex items-center gap-1">
                  <MyKingGlyph size={14} className={isWhite ? "text-chess-primary" : "text-chess-muted"} />
                  <span className="font-medium text-chess-primary truncate max-w-[80px] sm:max-w-none">{username}</span>
                  {myRating != null && <span className="text-chess-muted hidden sm:inline">({myRating})</span>}
                </span>
                <span className="text-chess-muted/55">vs</span>
                <span className="flex items-center gap-1">
                  <OppKingGlyph size={14} className={!isWhite ? "text-chess-primary" : "text-chess-muted"} />
                  <span className="font-medium text-chess-primary truncate max-w-[80px] sm:max-w-none">{opponent}</span>
                  {oppRating != null && <span className="text-chess-muted hidden sm:inline">({oppRating})</span>}
                </span>
              </div>
            </div>
          </div>

          {/* 우측 정보 */}
          <div className="flex flex-col items-end gap-1 sm:gap-2 text-xs sm:text-sm shrink-0">
            <div className="text-chess-muted font-medium">{dateStr}</div>
            <div className="text-chess-muted/70 text-[10px] sm:text-xs hidden sm:block">{timeStr}</div>
          </div>

          <span className={`inline-flex text-chess-muted transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}>
            <PixelCaretDownGlyph size={14} />
          </span>
        </div>
      </button>

      {/* ── 상세 패널 ── */}
      {open && (
        <div className="border-t border-chess-border/30 dark:border-chess-border/50 bg-chess-surface/30 dark:bg-chess-elevated/20">
          {/* 결과 요약 */}
          <div className={`px-4 sm:px-6 py-3 sm:py-4 border-t border-chess-border/25 ${resultOpenBand}`}>
            <div className="flex items-center justify-between gap-2">
              {/* 나 */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <MyKingGlyph size={22} className={`shrink-0 ${isWhite ? "text-chess-primary" : "text-chess-muted"}`} />
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-chess-accent truncate">{username}</p>
                  <p className="text-xs sm:text-sm text-chess-muted">{myColor}{myRating != null ? ` · ${myRating}` : ""}</p>
                </div>
              </div>

              {/* 결과 */}
              <div className="text-center shrink-0">
                <span className={`text-xl sm:text-2xl font-bold ${resultColor}`}>{resultLabel}</span>
                {ratingDiff !== null && (
                  <p
                    className={`text-xs sm:text-sm mt-0.5 ${
                      ratingDiff > 0
                        ? "text-chess-win"
                        : ratingDiff < 0
                          ? "text-chess-loss"
                          : "text-chess-primary"
                    }`}
                  >
                    {ratingDiff > 0 ? "+" : ""}{ratingDiff} {t("gh.card.diff")}
                  </p>
                )}
              </div>

              {/* 상대 */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="text-right min-w-0">
                  <p className="text-sm sm:text-base font-bold text-chess-primary truncate">{opponent}</p>
                  <p className="text-xs sm:text-sm text-chess-muted">{isWhite ? t("gh.card.black") : t("gh.card.white")}{oppRating != null ? ` · ${oppRating}` : ""}</p>
                </div>
                <OppKingGlyph size={22} className={`shrink-0 ${!isWhite ? "text-chess-primary" : "text-chess-muted"}`} />
              </div>
            </div>
          </div>

          {/* 게임 정보 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 p-3 sm:p-6">
            {terminationKey && (
              <div className="bg-chess-elevated/70 dark:bg-chess-bg/55 rounded-lg p-2.5 sm:p-3 ring-1 ring-chess-border/25 dark:ring-white/[0.06]">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.term")}</p>
                <p className="text-xs sm:text-sm font-semibold text-chess-primary">{t(terminationKey)}</p>
              </div>
            )}
            {moveCount != null && (
              <div className="bg-chess-elevated/70 dark:bg-chess-bg/55 rounded-lg p-2.5 sm:p-3 ring-1 ring-chess-border/25 dark:ring-white/[0.06]">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.movesCount")}</p>
                <p className="text-xs sm:text-sm font-semibold text-chess-primary">{moveCount} {t("gh.card.moves")}</p>
                {lengthLabel && <p className="text-[10px] sm:text-xs text-chess-muted/70">({lengthLabel})</p>}
              </div>
            )}
            {timeControl && (
              <div className="bg-chess-elevated/70 dark:bg-chess-bg/55 rounded-lg p-2.5 sm:p-3 ring-1 ring-chess-border/25 dark:ring-white/[0.06]">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.timeControl")}</p>
                <p className="text-xs sm:text-sm font-semibold text-chess-primary">{timeControl}</p>
              </div>
            )}
            <div className="bg-chess-elevated/70 dark:bg-chess-bg/55 rounded-lg p-2.5 sm:p-3 ring-1 ring-chess-border/25 dark:ring-white/[0.06]">
              <p className="text-xs text-chess-muted mb-1">{t("gh.card.playTime")}</p>
              <p className="text-xs sm:text-sm font-semibold text-chess-primary">{dateStr}</p>
              <p className="text-[10px] sm:text-xs text-chess-muted/70">{timeStr}</p>
            </div>
          </div>

          {/* 오프닝 정보 */}
          {game.opening_name && (
            <div className="px-3 sm:px-6 pb-3 sm:pb-4">
              <div className="bg-chess-elevated/60 dark:bg-chess-bg/50 rounded-lg p-3 sm:p-4 ring-1 ring-chess-border/30 dark:ring-white/[0.06]">
                <p className="text-xs text-chess-muted mb-1.5 font-semibold">{t("gh.card.opening")}</p>
                <p className="text-sm sm:text-base text-chess-primary font-medium">{game.opening_name}</p>
                {game.opening_eco && (
                  <p className="text-xs sm:text-sm text-chess-muted mt-1">{t("gh.card.ecoCode")}: {game.opening_eco}</p>
                )}
              </div>
            </div>
          )}

          {/* 외부 링크 */}
          {game.url && (
            <div className="px-3 sm:px-6 pb-3 sm:pb-4">
              <a
                href={toAnalysisUrl(game.url, game.platform, game.game_id) ?? game.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-pixel pixel-btn inline-flex items-center gap-2 px-4 py-2 bg-chess-accent/15 hover:bg-chess-accent/25 text-chess-accent border-chess-accent/50 font-medium text-sm"
              >
                <PixelLinkGlyph size={14} />
                {t("gh.card.watchLink")} ({game.platform === "chess.com" ? "Chess.com" : "Lichess"})
                <span className="text-xs opacity-70">→</span>
              </a>
            </div>
          )}

          {/* 게임 분석 버튼 */}
          {game.pgn && (
            <div className="px-3 sm:px-6 pb-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  if (isAnalyzedAtCurrentDepth) {
                    setShowAnalysis((v) => !v);
                    return;
                  }
                  setShowAnalysis(true);
                  stream.start();
                }}
                disabled={isAnalyzing}
                className="font-pixel pixel-btn w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-chess-accent/20 hover:bg-chess-accent/30 text-chess-accent border-chess-accent/55 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <PixelHourglassGlyph className="animate-pulse text-chess-accent" size={18} />
                    <span>{t("gh.btn.analyzing")}</span>
                  </>
                ) : isAnalyzedAtCurrentDepth && showAnalysis ? (
                  <>
                    <PixelXGlyph className="text-chess-accent" size={16} />
                    <span>{t("gh.btn.closeAnalysis")}</span>
                  </>
                ) : isAnalyzedAtCurrentDepth ? (
                  <>
                    <PixelCheckGlyph size={16} />
                    <span>{t("gh.btn.reviewAnalysis")}</span>
                  </>
                ) : (
                  <>
                    <PixelTargetGlyph className="text-chess-accent" size={16} />
                    <span>{t("gh.btn.analyze")}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 분석 결과 패널 */}
          {showAnalysis && (
            <div className="px-1 sm:px-6 pb-2 sm:pb-6">
              {!isAnalyzing && !isAnalysisError && !analysisData && game.pgn && (
                <div className="mb-4 p-3 pixel-frame border-chess-accent/40 bg-chess-accent/8 text-sm text-chess-primary">
                  {t("gh.analyze.depthChangedHint")}
                </div>
              )}
              {isAnalyzing && (
                <div className="mb-4 p-4 pixel-frame bg-chess-surface/85 dark:bg-chess-surface/40">
                  <p className="text-sm font-semibold text-chess-primary">
                    {stream.status === "queued" ? t("gh.analyze.queued") : t("gh.analyze.progressTitle")}
                  </p>
                  {stream.status === "streaming" && stream.totalMoves > 0 ? (
                    <>
                      <div className="mt-3 h-2.5 w-full border border-chess-border bg-chess-bg overflow-hidden">
                        <div
                          className="h-full bg-chess-accent transition-all duration-300 ease-out"
                          style={{ width: `${Math.round((stream.currentMove / stream.totalMoves) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-chess-muted leading-relaxed">
                        {t("gh.analyze.streaming")
                          .replace("{current}", String(stream.currentMove))
                          .replace("{total}", String(stream.totalMoves))}
                      </p>
                    </>
                  ) : (
                    <div className="mt-3 h-2.5 w-full border border-chess-border bg-chess-bg overflow-hidden">
                      <div className="h-full w-1/3 bg-chess-accent animate-loading-slide will-change-transform" />
                    </div>
                  )}
                </div>
              )}
              {isAnalysisError && (
                <div className="p-4 pixel-frame border-red-500/45 bg-red-500/10 text-chess-loss text-sm">
                  {stream.error || t("gh.analyze.error")}
                </div>
              )}
              
              {analysisData && (
                <GameAnalysisPanel 
                  data={analysisData}
                  selectedTier={selectedTier}
                  setSelectedTier={setSelectedTier}
                  selectedMove={selectedMove}
                  setSelectedMove={setSelectedMove}
                  onClose={() => setShowAnalysis(false)}
                  boardOrientation={isWhite ? "white" : "black"}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 게임 분석 패널 - T1~T6 탭 + 체스보드
// ─────────────────────────────────────────────
interface GameAnalysisPanelProps {
  data: BothPlayersAnalysis;
  selectedTier: MoveTier | "all";
  setSelectedTier: (tier: MoveTier | "all") => void;
  selectedMove: AnalyzedMove | null;
  setSelectedMove: (move: AnalyzedMove | null) => void;
  onClose: () => void;
  boardOrientation: "white" | "black";
}

const MOVE_TIER_COLOR: Record<MoveTier, string> = {
  TH: "#8b5cf6",
  TF: "#0ea5e9",
  T1: "#22c55e",
  T2: "#10b981",
  T3: "#34d399",
  T4: "#84cc16",
  T5: "#f59e0b",
  T6: "#ef4444",
};

const MOVE_TIER_LABEL_KEY: Record<MoveTier, I18nKey> = {
  TH: "tier.th.label",
  TF: "tier.tf.label",
  T1: "tier.t1.label",
  T2: "tier.t2.label",
  T3: "tier.t3.label",
  T4: "tier.t4.label",
  T5: "tier.t5.label",
  T6: "tier.t6.label",
};

const MOVE_TIER_DESC_KEY: Record<MoveTier, I18nKey> = {
  TH: "tier.th.desc",
  TF: "tier.tf.desc",
  T1: "tier.t1.desc",
  T2: "tier.t2.desc",
  T3: "tier.t3.desc",
  T4: "tier.t4.desc",
  T5: "tier.t5.desc",
  T6: "tier.t6.desc",
};
function GameAnalysisPanel({
  data,
  selectedTier,
  setSelectedTier,
  selectedMove,
  setSelectedMove,
  onClose,
  boardOrientation,
}: GameAnalysisPanelProps) {
  const { t, language } = useTranslation();
  const white: PlayerAnalysis = data.white_analysis;
  const black: PlayerAnalysis = data.black_analysis;
  const [showTierInfo, setShowTierInfo] = useState(false);

  const combinedMoves = useMemo(() => {
    return [...(white.analyzed_moves ?? []), ...(black.analyzed_moves ?? [])].sort(
      (a, b) => a.halfmove - b.halfmove
    );
  }, [white.analyzed_moves, black.analyzed_moves]);

  const filteredMoves = useMemo(() => {
    if (selectedTier === "all") return combinedMoves;
    return combinedMoves.filter((m) => m.tier === selectedTier);
  }, [combinedMoves, selectedTier]);

  const moveBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const moveListRef = useRef<HTMLDivElement>(null);

  // keyboard navigation (←/→)
  // 등급별 필터 선택 시 화살표 키 → 전체 모드로 전환 후 해당 수 기준 이전/다음으로 이동
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (combinedMoves.length === 0) return;

      e.preventDefault();
      const currentIdx = selectedMove
        ? combinedMoves.findIndex((m) => m.halfmove === selectedMove.halfmove)
        : -1;
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const nextIdx =
        currentIdx === -1
          ? (dir === 1 ? 0 : combinedMoves.length - 1)
          : Math.max(0, Math.min(combinedMoves.length - 1, currentIdx + dir));

      if (selectedTier !== "all") setSelectedTier("all");
      setSelectedMove(combinedMoves[nextIdx]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combinedMoves, selectedTier, setSelectedTier, selectedMove, setSelectedMove]);

  // keep selected move visible within the move list container (no page-level scroll)
  // Use getBoundingClientRect: offsetTop is relative to offsetParent, not the scroll box.
  useEffect(() => {
    if (!selectedMove) return;

    const scrollSelectedIntoView = () => {
      const el = moveBtnRefs.current[selectedMove.halfmove];
      const container = moveListRef.current;
      if (!el || !container) return;

      const cRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const relativeTop = elRect.top - cRect.top + container.scrollTop;
      const relativeBottom = relativeTop + elRect.height;
      const cTop = container.scrollTop;
      const cBottom = cTop + container.clientHeight;

      if (relativeTop < cTop) {
        container.scrollTop = relativeTop;
      } else if (relativeBottom > cBottom) {
        container.scrollTop = relativeBottom - container.clientHeight;
      }
    };

    scrollSelectedIntoView();
    const id = requestAnimationFrame(scrollSelectedIntoView);
    return () => cancelAnimationFrame(id);
  }, [selectedMove]);

  const openingName = data.opening?.name;
  const openingEco = data.opening?.eco;
  const thFullMoves = data.opening?.th_fullmoves;

  // 이전/다음 수 이동 헬퍼 (등급 필터 시 키보드/버튼 모두 → 전체 모드 전환 후 이동)
  const fullIdx = selectedMove
    ? combinedMoves.findIndex((m) => m.halfmove === selectedMove.halfmove)
    : -1;

  const goToPrev = () => {
    if (combinedMoves.length === 0) return;
    const nextIdx = fullIdx <= 0 ? 0 : fullIdx - 1;
    if (selectedTier !== "all") setSelectedTier("all");
    setSelectedMove(combinedMoves[nextIdx]);
  };

  const goToNext = () => {
    if (combinedMoves.length === 0) return;
    const nextIdx =
      fullIdx === -1
        ? 0
        : fullIdx >= combinedMoves.length - 1
          ? combinedMoves.length - 1
          : fullIdx + 1;
    if (selectedTier !== "all") setSelectedTier("all");
    setSelectedMove(combinedMoves[nextIdx]);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-chess-border/60 pb-3">
        <h4 className="text-base font-bold text-chess-primary flex items-center gap-2">
          <PixelChartGlyph className="text-chess-accent shrink-0" size={18} />
          {t("ga.title")}
        </h4>
        <button
          onClick={onClose}
          className="text-chess-muted hover:text-chess-primary transition-colors text-sm px-3 py-1 rounded border border-chess-border hover:border-chess-muted inline-flex items-center gap-1.5"
        >
          <PixelXGlyph size={14} />
          {t("ga.close")}
        </button>
      </div>

      {/* 오프닝 (TH) */}
      {(openingName || openingEco || thFullMoves != null) && (
        <div className="pixel-frame bg-chess-surface/50 dark:bg-chess-elevated/25 px-3 sm:px-4 py-2 sm:py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-chess-primary">{t("ga.opening")}</span>
            <span className="text-chess-muted truncate">
              {openingName ?? "—"}
              {openingEco ? <span className="ml-2 font-mono text-chess-muted/80">({openingEco})</span> : null}
            </span>
            {thFullMoves != null && (
              <span className="rounded-full bg-chess-accent/12 border border-chess-accent/25 px-2.5 py-1 text-xs font-semibold text-chess-accent">
                TH {thFullMoves}
              </span>
            )}
          </div>
          {thFullMoves != null && (
            <p className="mt-1 text-xs text-chess-muted/80">
              {t("ga.openingDesc")}
            </p>
          )}
        </div>
      )}

      {/* ── 메인 레이아웃 ── */}
      <div className="space-y-3 sm:space-y-5">
        {/* ─── 상단: 보드(좌) + 기보(우) ─── */}
        <div className="flex flex-col xl:flex-row gap-3 sm:gap-5">

          {/* 체스보드 영역 */}
          <div className="flex flex-col gap-2 sm:gap-3 w-full xl:w-auto shrink-0">
            {/* 수 정보 헤더 + PC용 이전/다음 버튼 */}
            <div className="w-full flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {selectedMove ? (
                  <>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-chess-surface dark:bg-chess-bg text-chess-primary border border-chess-border/80 dark:border-chess-border shadow-sm truncate max-w-[90px] sm:max-w-none">
                      {selectedMove.move_number}. {selectedMove.san}
                    </span>
                    <span
                      className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-black text-white shadow-sm shrink-0"
                      style={{ backgroundColor: MOVE_TIER_COLOR[selectedMove.tier] }}
                    >
                      {selectedMove.tier}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-chess-primary/80 font-semibold">{t("ga.board")}</span>
                )}
              </div>
              {/* PC 전용 소형 버튼 + 키보드 힌트 */}
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={filteredMoves.length === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-chess-border bg-chess-surface dark:bg-chess-bg text-chess-primary hover:bg-chess-border/50 dark:hover:bg-chess-elevated/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                  aria-label={t("ga.aria.prevMove")}
                >
                  <PixelCaretLeftGlyph size={14} className="text-chess-primary" />
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={filteredMoves.length === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-chess-border bg-chess-surface dark:bg-chess-bg text-chess-primary hover:bg-chess-border/50 dark:hover:bg-chess-elevated/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                  aria-label={t("ga.aria.nextMove")}
                >
                  <PixelCaretRightGlyph size={14} className="text-chess-primary" />
                </button>
                <span className="text-[11px] text-chess-primary/70 border border-chess-border/60 bg-chess-surface dark:bg-chess-elevated/35 rounded px-2 py-0.5 font-medium ml-1 inline-flex items-center gap-0.5">
                  <PixelCaretLeftGlyph size={10} />
                  <span className="font-pixel opacity-80">/</span>
                  <PixelCaretRightGlyph size={10} />
                </span>
              </div>
            </div>

            {/* 보드 */}
            <div className="w-full max-w-[400px] xl:mx-0">
              <ChessBoard
                fen={selectedMove?.fen_after || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
                size={400}
                lastMove={selectedMove ? {
                  from: selectedMove.uci.substring(0, 2),
                  to: selectedMove.uci.substring(2, 4),
                } : undefined}
                orientation={boardOrientation}
                arrows={(() => {
                  if (!selectedMove) return [];
                  const tier = selectedMove.tier;
                  if (!["T3", "T4", "T5", "T6"].includes(tier)) return [];
                  if (selectedMove.user_move_rank === 1 || selectedMove.is_only_best) return [];
                  const best = selectedMove.top_moves?.find((m) => m.rank === 1);
                  if (!best?.uci || best.uci.length < 4) return [];
                  const from = best.uci.substring(0, 2);
                  const to = best.uci.substring(2, 4);
                  return [{ startSquare: from, endSquare: to, color: "rgba(59,130,246,0.7)" }];
                })()}
              />
            </div>

            {/* 엔진 평가 바 */}
            {selectedMove && (
              <div className="w-full max-w-[400px] xl:mx-0 flex items-stretch gap-3 pixel-frame bg-chess-surface dark:bg-chess-elevated/25 p-2 sm:p-3">
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-[10px] uppercase tracking-widest text-chess-primary/70 font-bold mb-0.5">{t("ga.eval")}</span>
                  <span className="text-sm font-bold text-chess-primary font-mono whitespace-nowrap inline-flex items-center gap-1">
                    {selectedMove.cp_before !== null ? `${selectedMove.cp_before > 0 ? "+" : ""}${selectedMove.cp_before}` : "?"}
                    <PixelCaretRightGlyph size={12} className="text-chess-muted shrink-0" />
                    {selectedMove.cp_after !== null ? `${selectedMove.cp_after > 0 ? "+" : ""}${selectedMove.cp_after}` : "?"}
                  </span>
                </div>
                <div className="w-px bg-chess-border/80" />
                <div className="flex flex-col justify-center">
                  <span className="text-[10px] uppercase tracking-widest text-chess-primary/70 font-bold mb-0.5">{t("ga.winPctLoss")}</span>
                  <span
                    className="text-sm font-bold font-mono"
                    style={{
                      color: selectedMove.win_pct_loss >= 10
                        ? "#e11d48"
                        : selectedMove.win_pct_loss >= 3
                          ? "#d97706"
                          : "#059669",
                    }}
                  >
                    {selectedMove.win_pct_loss.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            {/* 모바일 전용 이전/다음 버튼 (보드 아래) */}
            <div className="flex sm:hidden gap-2 w-full max-w-[400px] mx-auto">
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); goToPrev(); }}
                disabled={filteredMoves.length === 0}
                style={{ touchAction: "manipulation" }}
                className="font-pixel pixel-btn flex-1 py-3 flex items-center justify-center bg-chess-surface dark:bg-chess-bg text-chess-primary active:bg-chess-border/40 dark:active:bg-chess-elevated/35 disabled:opacity-30 disabled:cursor-not-allowed text-lg font-bold select-none"
                aria-label={t("ga.aria.prevMove")}
              >
                <PixelCaretLeftGlyph size={18} className="text-chess-primary" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); goToNext(); }}
                disabled={filteredMoves.length === 0}
                style={{ touchAction: "manipulation" }}
                className="font-pixel pixel-btn flex-1 py-3 flex items-center justify-center bg-chess-surface dark:bg-chess-bg text-chess-primary active:bg-chess-border/40 dark:active:bg-chess-elevated/35 disabled:opacity-30 disabled:cursor-not-allowed text-lg font-bold select-none"
                aria-label={t("ga.aria.nextMove")}
              >
                <PixelCaretRightGlyph size={18} className="text-chess-primary" />
              </button>
            </div>
          </div>

          {/* 기보 패널 */}
          <div className="flex-1 flex flex-col min-w-0 pixel-frame bg-chess-surface/65 dark:bg-chess-elevated/15 overflow-hidden">
            {/* 티어 필터 탭: 모바일=가로 스크롤 1줄 + 느낌표 고정, PC=줄바꿈 */}
            <div className="border-b border-chess-border/80 dark:border-chess-border bg-chess-surface dark:bg-chess-bg/60">
              <div className="flex items-center gap-2 p-2 sm:p-3">
                {/* 모바일: 탭만 스크롤, 느낌표는 항상 오른쪽에 고정 */}
                <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
                  <div className="flex sm:flex-wrap gap-1.5">
                    <button
                      onClick={() => setSelectedTier("all")}
                      className={`font-pixel shrink-0 px-3 py-1.5 text-xs font-bold pixel-btn ${
                        selectedTier === "all"
                          ? "bg-chess-inverse text-white border-chess-inverse"
                          : "bg-chess-bg dark:bg-chess-elevated/25 text-chess-muted hover:text-chess-primary"
                      }`}
                    >
                      {t("ga.all")}
                      <span className="ml-1.5 font-normal opacity-80">({filteredMoves.length})</span>
                    </button>
                    {(["TH", "TF", "T1", "T2", "T3", "T4", "T5", "T6"] as MoveTier[]).map((tier) => {
                      const sel = selectedTier === tier;
                      const tierBg = MOVE_TIER_COLOR[tier];
                      return (
                        <button
                          key={tier}
                          onClick={() => setSelectedTier(tier)}
                          className={`font-pixel shrink-0 px-3 py-1.5 text-xs font-bold pixel-btn ${
                            sel ? "text-white border-transparent" : "bg-chess-bg dark:bg-chess-elevated/25 text-chess-muted hover:text-chess-primary"
                          }`}
                          style={sel ? { backgroundColor: tierBg } : {}}
                        >
                          {tier}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* 등급 설명 토글 (스크롤 밖에 배치 — 모바일에서 항상 보임) */}
                <button
                  type="button"
                  onClick={() => setShowTierInfo((v) => !v)}
                  className={`font-pixel shrink-0 w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center text-sm sm:text-xs font-black pixel-btn select-none ${
                    showTierInfo
                      ? "bg-chess-accent text-white border-chess-accent"
                      : "bg-chess-primary dark:bg-chess-muted text-white border-chess-primary dark:border-chess-muted hover:bg-chess-muted dark:hover:bg-chess-border"
                  }`}
                  aria-label={t("ga.aria.tierLegendToggle")}
                >
                  ！
                </button>
              </div>
            </div>

            {/* 등급 설명 패널 */}
            {showTierInfo && (
              <div className="border-b border-chess-border bg-chess-surface/60 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {(["TH", "TF", "T1", "T2", "T3", "T4", "T5", "T6"] as MoveTier[]).map((tier) => {
                  const tierBg = MOVE_TIER_COLOR[tier];
                  return (
                    <div key={tier} className="flex items-center gap-1.5 py-0.5">
                      <span
                        className="shrink-0 w-7 text-center rounded text-[10px] font-black text-white py-0.5 leading-none"
                        style={{ backgroundColor: tierBg }}
                      >
                        {tier}
                      </span>
                      <span className="text-[11px] font-semibold text-chess-primary whitespace-nowrap">
                        {t(MOVE_TIER_LABEL_KEY[tier])}
                      </span>
                      <span className="text-[10px] text-chess-muted truncate hidden sm:inline">
                        — {t(MOVE_TIER_DESC_KEY[tier])}
                      </span>
                    </div>
                  );
                })}
                <p className="col-span-2 text-[10px] text-chess-muted mt-1 sm:hidden">{t("ga.tierLegendMobile")}</p>
              </div>
            )}

            {/* 기보 목록 */}
            <div ref={moveListRef} className="overflow-y-auto divide-y divide-chess-border/40 max-h-[200px] sm:max-h-[480px]">
              {filteredMoves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-chess-primary/70 text-sm gap-3">
                  <PixelInboxGlyph size={40} className="opacity-40" />
                  <span className="font-semibold">{t("ga.noMoves")}</span>
                </div>
              ) : (
                filteredMoves.map((move: AnalyzedMove) => {
                  const isSelected = selectedMove?.halfmove === move.halfmove;
                  const moveTierBg = MOVE_TIER_COLOR[move.tier];
                  return (
                    <button
                      key={move.halfmove}
                      ref={(el) => { moveBtnRefs.current[move.halfmove] = el; }}
                      onClick={() => setSelectedMove(move)}
                      className={`w-full flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-2 sm:py-3 text-left transition-colors ${
                        isSelected ? "bg-chess-accent/10 border-l-4 border-l-chess-accent" : "hover:bg-chess-surface/60 border-l-4 border-l-transparent"
                      }`}
                    >
                      {/* 색 인디케이터 */}
                      <div
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center text-[9px] sm:text-[10px] shrink-0 font-bold border shadow-sm ${
                          move.color === "white"
                            ? "bg-white text-gray-800 border-gray-200"
                            : "bg-gray-800 text-white border-gray-900"
                        }`}
                      >
                        {move.color === "white" ? "W" : "B"}
                      </div>
                      {/* 티어 뱃지 */}
                      <span
                        className="w-7 sm:w-8 text-center shrink-0 rounded text-[9px] sm:text-[10px] font-black py-0.5 text-white shadow-sm"
                        style={{ backgroundColor: moveTierBg }}
                      >
                        {move.tier}
                      </span>
                      {/* SAN + 통계 */}
                      <div className="flex-1 min-w-0 flex items-center sm:block gap-1.5">
                        {/* 모바일: 한 줄 (수 이름 + 유일해 뱃지) */}
                        <span className={`text-xs sm:text-sm font-bold truncate ${isSelected ? "text-chess-primary" : "text-chess-primary/80"}`}>
                          {move.move_number}. {move.san}
                        </span>
                        {move.is_only_best && move.tier !== "TH" && (
                          <span className="shrink-0 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full bg-emerald-100 text-chess-win border border-emerald-200 font-bold whitespace-nowrap">
                            {t("ga.onlyBest")}
                          </span>
                        )}
                        {/* 손실% - 모바일: 오른쪽 끝에 작게, PC: 두 번째 줄 */}
                        <span className="ml-auto shrink-0 text-[10px] font-semibold text-chess-primary/70 sm:hidden tabular-nums">
                          {move.win_pct_loss.toFixed(1)}%
                        </span>
                        <p className="hidden sm:block text-[11px] font-semibold mt-0.5">
                          {move.tier === "TH" ? (
                            <span className="text-chess-win/90">
                              {t("ga.theoryMoveNote")}
                            </span>
                          ) : move.user_move_rank === 0 ? (
                            <span className="text-orange-400">
                              {t("ga.notInTop5").replace("{loss}", move.win_pct_loss.toFixed(1))}
                            </span>
                          ) : (
                            <span className="text-chess-primary/80">
                              {t("ga.engineRankLine").replace("{rank}", String(move.user_move_rank)).replace("{loss}", move.win_pct_loss.toFixed(1))}
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ─── 하단: 양 플레이어 정확도 + 차트 ─── */}
        {/* 모바일: 정확도 요약 바만 표시. PC: 도넛 차트 포함 전체 표시 */}

        {/* 모바일 전용: 정확도 요약 (세로 2줄) */}
        <div className="flex sm:hidden flex-col gap-2">
          {/* 백 */}
          <div className="pixel-frame bg-chess-surface/55 dark:bg-chess-elevated/20 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[var(--pixel-radius)] bg-chess-surface dark:bg-chess-bg flex items-center justify-center border-2 border-chess-border shrink-0 text-chess-primary">
              <PixelKingWhiteGlyph size={16} />
            </div>
            <span className="text-xs font-bold text-chess-primary truncate flex-1 min-w-0">{data.white_player}</span>
            <span className="text-[10px] text-chess-primary/60 uppercase shrink-0">{t("ga.white")}</span>
            <span className="text-base font-black text-chess-accent shrink-0 tabular-nums">{white.accuracy.toFixed(1)}%</span>
          </div>
          {/* 흑 */}
          <div className="pixel-frame bg-chess-surface/55 dark:bg-chess-elevated/20 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[var(--pixel-radius)] bg-chess-inverse flex items-center justify-center border-2 border-chess-inverse/80 shrink-0 text-white">
              <PixelKingBlackGlyph size={16} className="text-white" />
            </div>
            <span className="text-xs font-bold text-chess-primary truncate flex-1 min-w-0">{data.black_player}</span>
            <span className="text-[10px] text-chess-primary/60 uppercase shrink-0">{t("ga.black")}</span>
            <span className="text-base font-black text-chess-accent shrink-0 tabular-nums">{black.accuracy.toFixed(1)}%</span>
          </div>
        </div>

        {/* PC 전용: 도넛 차트 포함 전체 카드 */}
        <div className="hidden sm:grid sm:grid-cols-2 gap-4">
          {/* 백 */}
          <div className="pixel-frame bg-chess-surface/45 dark:bg-chess-elevated/15 p-6 flex flex-col items-center">
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="w-10 h-10 rounded-[var(--pixel-radius)] bg-chess-surface dark:bg-chess-bg flex items-center justify-center shrink-0 border-2 border-chess-border dark:border-chess-border text-chess-primary">
                <PixelKingWhiteGlyph size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-chess-primary truncate">{data.white_player}</p>
                <p className="text-xs text-chess-primary/70 font-bold uppercase tracking-wider">{t("ga.white")}</p>
              </div>
              <div className="ml-auto text-right shrink-0">
                <p className="text-2xl font-black text-chess-accent">{white.accuracy.toFixed(1)}%</p>
                <p className="text-[10px] text-chess-primary/70 font-bold uppercase tracking-widest">{t("ga.accuracy")}</p>
              </div>
            </div>
            <TierDonutChart
              tierPercentages={white.tier_percentages}
              tierCounts={white.tier_counts}
              size={200}
              strokeWidth={18}
            />
          </div>

          {/* 흑 */}
          <div className="pixel-frame bg-chess-surface/45 dark:bg-chess-elevated/15 p-6 flex flex-col items-center">
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="w-10 h-10 rounded-[var(--pixel-radius)] bg-chess-inverse flex items-center justify-center shrink-0 border-2 border-chess-inverse/80 text-white">
                <PixelKingBlackGlyph size={22} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-chess-primary truncate">{data.black_player}</p>
                <p className="text-xs text-chess-primary/70 font-bold uppercase tracking-wider">{t("ga.black")}</p>
              </div>
              <div className="ml-auto text-right shrink-0">
                <p className="text-2xl font-black text-chess-accent">{black.accuracy.toFixed(1)}%</p>
                <p className="text-[10px] text-chess-primary/70 font-bold uppercase tracking-widest">{t("ga.accuracy")}</p>
              </div>
            </div>
            <TierDonutChart
              tierPercentages={black.tier_percentages}
              tierCounts={black.tier_counts}
              size={200}
              strokeWidth={18}
            />
          </div>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────
// 스켈레톤 - 더 현대적인 디자인
// ─────────────────────────────────────────────
function GameListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="pixel-frame bg-chess-surface/90 p-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-[var(--pixel-radius)] bg-chess-border/30 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-chess-border/20 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-chess-border/15 rounded animate-pulse w-1/2" />
            </div>
            <div className="w-16 h-3 bg-chess-border/20 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// 메인 섹션
// ─────────────────────────────────────────────
interface GameHistorySectionProps {
  username: string;
  platform: Platform;
  timeClass: TimeClass;
  sinceMs?: number;
  untilMs?: number;
}

export default function GameHistorySection({
  username, platform, timeClass, sinceMs, untilMs,
}: GameHistorySectionProps) {
  const { t } = useTranslation();
  const [maxGames, setMaxGames] = useState(30);
  const gamesListRef = useRef<HTMLDivElement>(null);
  const prevGamesLength = useRef(0);

  const { data: games, isLoading, isError, refetch } = useQuery({
    queryKey: ["games-list", platform, username, timeClass, sinceMs, untilMs, maxGames],
    queryFn: () => getRecentGamesList(platform, username, timeClass, maxGames, sinceMs, untilMs),
    enabled: !!username,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 새로운 게임이 로드되면 스크롤을 새 게임 위치로 이동
  useEffect(() => {
    if (games && games.length > prevGamesLength.current && prevGamesLength.current > 0) {
      // 새로 로드된 게임의 첫 번째 요소로 스크롤
      const newGameIndex = prevGamesLength.current;
      const gameElements = gamesListRef.current?.children;
      if (gameElements && gameElements[newGameIndex]) {
        gameElements[newGameIndex].scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    prevGamesLength.current = games?.length ?? 0;
  }, [games]);

  if (!username) {
    return (
      <div className="flex flex-col items-center py-24 gap-3 text-chess-muted">
        <PixelPawnGlyph className="opacity-50" size={52} />
        <p className="text-sm">{t("dh.emptyState")}</p>
      </div>
    );
  }

  if (isLoading) return <GameListSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-chess-muted">
        <PixelWarnGlyph className="text-chess-warn" size={40} />
        <p className="text-sm">{t("gh.error")}</p>
        <button onClick={() => refetch()} className="text-xs text-chess-accent hover:underline">
          {t("gh.retry")}
        </button>
      </div>
    );
  }

  if (!games || games.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-chess-muted">
        <PixelInboxGlyph size={40} className="opacity-45" />
        <p className="text-sm">{t("gh.noGamesPeriod")}</p>
      </div>
    );
  }

  const wins  = games.filter(g => g.result === "win").length;
  const draws = games.filter(g => g.result === "draw").length;
  const losses = games.filter(g => g.result === "loss").length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 결과 요약 헤더 */}
      <div className="pixel-frame bg-chess-bg/92 dark:bg-chess-elevated/20 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 sm:gap-5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-chess-primary mb-2">{t("gh.summary.title")}</h3>
            <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-chess-muted">{t("gh.summary.total")}</span>
                <span className="text-lg sm:text-xl font-bold text-chess-primary">{games.length}</span>
                <span className="text-chess-muted">{t("gh.summary.game")}</span>
              </div>
              <div className="flex items-center gap-x-3 sm:gap-x-4 gap-y-2 flex-wrap">
                <div className="flex items-center gap-1 min-w-fit">
                  <span className="text-base sm:text-lg font-bold text-chess-win">{wins}</span>
                  <span className="text-xs sm:text-sm text-chess-win/90">{t("gh.summary.win")}</span>
                </div>
                <div className="flex items-center gap-1 min-w-fit">
                  <span className="text-base sm:text-lg font-bold text-amber-900 dark:text-amber-400">{draws}</span>
                  <span className="text-xs sm:text-sm text-amber-800/90 dark:text-amber-400/75">{t("gh.summary.draw")}</span>
                </div>
                <div className="flex items-center gap-1 min-w-fit">
                  <span className="text-base sm:text-lg font-bold text-chess-loss">{losses}</span>
                  <span className="text-xs sm:text-sm text-chess-loss/90">{t("gh.summary.loss")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 승률 바와 퍼센트 */}
          <div className="text-right w-full sm:w-auto">
            <div className="text-xs sm:text-sm text-chess-muted mb-1.5 sm:mb-2">{t("gh.summary.winRate")}</div>
            <div className="flex items-center gap-3">
              <div className="flex flex-row flex-1 sm:flex-none sm:w-48 h-2.5 overflow-hidden bg-chess-elevated/80 dark:bg-chess-bg/60 border border-chess-border/50">
                {wins > 0  && <div style={{ width: `${wins  / games.length * 100}%` }} className="h-full shrink-0 bg-emerald-700 dark:bg-emerald-600/90 transition-all duration-500" />}
                {draws > 0 && <div style={{ width: `${draws / games.length * 100}%` }} className="h-full shrink-0 bg-amber-700 dark:bg-amber-600/90 transition-all duration-500" />}
                {losses > 0 && <div style={{ width: `${losses / games.length * 100}%` }} className="h-full shrink-0 bg-red-700 dark:bg-red-600/90 transition-all duration-500" />}
              </div>
              <span className="text-lg font-bold text-chess-primary">
                {Math.round((wins / games.length) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 게임 목록 */}
      <div ref={gamesListRef} className="space-y-4">
        {games.map((game) => (
          <GameCard key={game.game_id} game={game} username={username} />
        ))}
      </div>

      {/* 더 보기 */}
      {games.length >= maxGames && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => setMaxGames((p) => p + 30)}
            className="group font-pixel pixel-btn px-6 py-2.5 text-sm font-medium text-chess-primary bg-chess-surface/85 dark:bg-chess-elevated/25 hover:bg-chess-elevated dark:hover:bg-chess-elevated/40"
          >
            <span className="flex items-center gap-2">
              <span>{t("gh.btn.loadMore")}</span>
              <span className="text-chess-muted">(+30)</span>
              <span className="transition-transform duration-200 group-hover:translate-x-0.5 text-chess-muted" aria-hidden>
                &rarr;
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
