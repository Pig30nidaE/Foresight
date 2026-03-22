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
        "border shadow-sm bg-emerald-100 text-emerald-950 border-emerald-600/35 dark:bg-emerald-900/35 dark:text-emerald-200 dark:border-emerald-500/45",
    },
    loss: {
      labelKey: "gh.summary.loss",
      cls:
        "border shadow-sm bg-red-100 text-red-950 border-red-600/35 dark:bg-red-900/35 dark:text-red-200 dark:border-red-500/45",
    },
    draw: {
      labelKey: "gh.summary.draw",
      cls:
        "border shadow-sm bg-amber-100 text-amber-950 border-amber-600/35 dark:bg-amber-900/35 dark:text-amber-200 dark:border-amber-500/45",
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
    case "MOVE":
      return { ...state, currentMove: state.currentMove + 1, moves: [...state.moves, action.payload] };
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

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
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
  const myIcon   = isWhite ? "♔" : "♚";
  const oppIcon  = isWhite ? "♚" : "♔";
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

  // Use compact glyphs (reduce emoji clutter) while keeping the original structure.
  const tcIcon: Record<string, string> = { bullet: "B", blitz: "Z", rapid: "R", classical: "C" };

  const resultColor = {
    win:  "text-emerald-800 dark:text-emerald-400",
    loss: "text-red-700 dark:text-red-400",
    draw: "text-amber-900 dark:text-amber-400",
  }[game.result];

  const resultLabel = { win: t("gh.card.win"), loss: t("gh.card.loss"), draw: t("gh.card.draw") }[game.result];

  const resultBgGradient = {
    win:  "from-emerald-100/90 to-emerald-50/70 border-emerald-400/50 dark:from-emerald-500/10 dark:to-emerald-600/5 dark:border-emerald-500/30",
    loss: "from-red-100/90 to-red-50/70 border-red-400/50 dark:from-red-500/10 dark:to-red-600/5 dark:border-red-500/30",
    draw: "from-amber-100/90 to-amber-50/70 border-amber-500/45 dark:from-amber-500/10 dark:to-amber-600/5 dark:border-amber-500/30",
  }[game.result];

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-300 shadow-lg hover:shadow-xl ${
      open 
        ? `bg-gradient-to-br ${resultBgGradient} border-2 shadow-2xl` 
        : "bg-chess-surface/90 border border-chess-border/50 hover:border-chess-border/80"
    }`}>
      {/* ── 헤더 ── */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={`w-full p-3 sm:p-4 transition-all duration-200 text-left ${
          open ? "bg-chess-surface/20" : "hover:bg-chess-surface/50"
        }`}
      >
        <div className="flex items-center gap-2.5 sm:gap-4">
          <ResultBadge result={game.result} size="lg" t={t} />

          {/* 메인 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1.5 flex-wrap">
              <span className={`text-base sm:text-lg font-bold ${resultColor}`}>{resultLabel}</span>
              <span className="text-sm font-mono opacity-70">{tcIcon[game.time_class] ?? "♟"}</span>
              {ratingDiff !== null && (
                <span className={`text-xs sm:text-sm font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-chess-bg/60 border ${
                  ratingDiff > 0
                    ? "text-emerald-800 border-emerald-400/50 dark:text-emerald-400 dark:border-emerald-500/30"
                    : "text-red-700 border-red-400/50 dark:text-red-400 dark:border-red-500/30"
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
                  <span>{myIcon}</span>
                  <span className="font-medium text-chess-primary truncate max-w-[80px] sm:max-w-none">{username}</span>
                  {myRating != null && <span className="text-chess-muted hidden sm:inline">({myRating})</span>}
                </span>
                <span className="opacity-40">vs</span>
                <span className="flex items-center gap-1">
                  <span>{oppIcon}</span>
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

          <span className={`text-chess-muted transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {/* ── 상세 패널 ── */}
      {open && (
        <div className="border-t border-chess-border/30 bg-chess-surface/30">
          {/* 결과 요약 */}
          <div className={`px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r ${resultBgGradient}`}>
            <div className="flex items-center justify-between gap-2">
              {/* 나 */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className={`text-xl sm:text-2xl ${isWhite ? "text-chess-primary" : "text-chess-muted"}`}>{myIcon}</span>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-chess-accent truncate">{username}</p>
                  <p className="text-xs sm:text-sm text-chess-muted">{myColor}{myRating != null ? ` · ${myRating}` : ""}</p>
                </div>
              </div>

              {/* 결과 */}
              <div className="text-center shrink-0">
                <span className={`text-xl sm:text-2xl font-bold ${resultColor}`}>{resultLabel}</span>
                {ratingDiff !== null && (
                  <p className="text-xs sm:text-sm text-chess-muted mt-0.5">
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
                <span className={`text-xl sm:text-2xl ${!isWhite ? "text-chess-primary" : "text-chess-muted"}`}>{oppIcon}</span>
              </div>
            </div>
          </div>

          {/* 게임 정보 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 p-3 sm:p-6">
            {terminationKey && (
              <div className="bg-chess-bg/40 rounded-lg p-2.5 sm:p-3">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.term")}</p>
                <p className="text-xs sm:text-sm font-semibold text-chess-primary">{t(terminationKey)}</p>
              </div>
            )}
            {moveCount != null && (
              <div className="bg-chess-bg/40 rounded-lg p-2.5 sm:p-3">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.movesCount")}</p>
                <p className="text-xs sm:text-sm font-semibold text-chess-primary">{moveCount} {t("gh.card.moves")}</p>
                {lengthLabel && <p className="text-[10px] sm:text-xs text-chess-muted/70">({lengthLabel})</p>}
              </div>
            )}
            {timeControl && (
              <div className="bg-chess-bg/40 rounded-lg p-2.5 sm:p-3">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.timeControl")}</p>
                <p className="text-xs sm:text-sm font-semibold text-chess-primary">{timeControl}</p>
              </div>
            )}
            <div className="bg-chess-bg/40 rounded-lg p-2.5 sm:p-3">
              <p className="text-xs text-chess-muted mb-1">{t("gh.card.playTime")}</p>
              <p className="text-xs sm:text-sm font-semibold text-chess-primary">{dateStr}</p>
              <p className="text-[10px] sm:text-xs text-chess-muted/70">{timeStr}</p>
            </div>
          </div>

          {/* 오프닝 정보 */}
          {game.opening_name && (
            <div className="px-3 sm:px-6 pb-3 sm:pb-4">
              <div className="bg-chess-bg/30 rounded-lg p-3 sm:p-4">
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-chess-accent/10 hover:bg-chess-accent/20 text-chess-accent hover:text-chess-accent/80 border border-chess-accent/30 hover:border-chess-accent/50 rounded-lg transition-all duration-200 font-medium text-sm"
              >
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
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-chess-accent/20 to-chess-accent/10 hover:from-chess-accent/30 hover:to-chess-accent/20 text-chess-accent border border-chess-accent/40 hover:border-chess-accent/60 rounded-xl transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>{t("gh.btn.analyzing")}</span>
                  </>
                ) : isAnalyzedAtCurrentDepth && showAnalysis ? (
                  <>
                    <span>✅</span>
                    <span>분석 닫기</span>
                  </>
                ) : isAnalyzedAtCurrentDepth ? (
                  <>
                    <span>✅</span>
                    <span>{t("gh.btn.reviewAnalysis")}</span>
                  </>
                ) : (
                  <>
                    <span>🎯</span>
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
                <div className="mb-4 p-3 rounded-xl border border-chess-accent/30 bg-chess-accent/5 text-sm text-chess-primary">
                  {t("gh.analyze.depthChangedHint")}
                </div>
              )}
              {isAnalyzing && (
                <div className="mb-4 p-4 rounded-xl border border-chess-border bg-chess-surface/80 dark:bg-chess-surface/40">
                  <p className="text-sm font-semibold text-chess-primary">
                    {stream.status === "queued" ? t("gh.analyze.queued") : t("gh.analyze.progressTitle")}
                  </p>
                  {stream.status === "streaming" && stream.totalMoves > 0 ? (
                    <>
                      <div className="mt-3 h-2 w-full rounded-full bg-chess-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-chess-accent transition-all duration-300 ease-out"
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
                    <div className="mt-3 h-2 w-full rounded-full bg-chess-border overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-chess-accent animate-loading-slide will-change-transform" />
                    </div>
                  )}
                </div>
              )}
              {isAnalysisError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
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

const TIER_CONFIG: Record<MoveTier, { label: string; color: string; desc: string }> = {
  TH: { label: "이론", color: "#8b5cf6", desc: "오프닝 이론수" },
  TF: { label: "강제", color: "#0ea5e9", desc: "합법 수가 1개뿐인 수" },
  T1: { label: "정점", color: "#22c55e", desc: "역전/희생급 명수" },
  T2: { label: "최상", color: "#10b981", desc: "최상급 정확수" },
  T3: { label: "우수", color: "#34d399", desc: "우수한 수" },
  T4: { label: "양호", color: "#84cc16", desc: "양호한 수" },
  T5: { label: "보통", color: "#f59e0b", desc: "아쉬운 수" },
  T6: { label: "폐기", color: "#ef4444", desc: "큰 실수" },
};

// TIER_CONFIG labels are defined statically – localised labels are looked up
// via `t("tier.XY.label")` in code rather than from TIER_CONFIG.label.
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
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (filteredMoves.length === 0) return;

      e.preventDefault();
      const currentIdx = selectedMove
        ? filteredMoves.findIndex((m) => m.halfmove === selectedMove.halfmove)
        : -1;

      const dir = e.key === "ArrowRight" ? 1 : -1;
      const nextIdx =
        currentIdx === -1
          ? (dir === 1 ? 0 : filteredMoves.length - 1)
          : Math.max(0, Math.min(filteredMoves.length - 1, currentIdx + dir));

      setSelectedMove(filteredMoves[nextIdx]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredMoves, selectedMove, setSelectedMove]);

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

  // 이전/다음 수 이동 헬퍼
  const currentIdx = selectedMove
    ? filteredMoves.findIndex((m) => m.halfmove === selectedMove.halfmove)
    : -1;

  const goToPrev = () => {
    if (filteredMoves.length === 0) return;
    const nextIdx = currentIdx <= 0 ? filteredMoves.length - 1 : currentIdx - 1;
    setSelectedMove(filteredMoves[nextIdx]);
  };

  const goToNext = () => {
    if (filteredMoves.length === 0) return;
    const nextIdx = currentIdx === -1 || currentIdx >= filteredMoves.length - 1 ? 0 : currentIdx + 1;
    setSelectedMove(filteredMoves[nextIdx]);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-chess-border/60 pb-3">
        <h4 className="text-base font-bold text-chess-primary flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-chess-accent inline-block" />
          {t("ga.title")}
        </h4>
        <button
          onClick={onClose}
          className="text-chess-muted hover:text-chess-primary transition-colors text-sm px-3 py-1 rounded border border-chess-border hover:border-chess-muted"
        >
          {t("ga.close")}
        </button>
      </div>

      {/* 오프닝 (TH) */}
      {(openingName || openingEco || thFullMoves != null) && (
        <div className="rounded-xl border border-chess-border/40 bg-chess-bg/30 px-3 sm:px-4 py-2 sm:py-3 text-sm">
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
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-chess-bg text-chess-primary border border-chess-border shadow-sm truncate max-w-[90px] sm:max-w-none">
                      {selectedMove.move_number}. {selectedMove.san}
                    </span>
                    <span
                      className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-black text-white shadow-sm shrink-0"
                      style={{ backgroundColor: TIER_CONFIG[selectedMove.tier].color }}
                    >
                      {selectedMove.tier}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-chess-primary/80 font-semibold">{typeof t === "function" ? t("ga.board") : "체스보드"}</span>
                )}
              </div>
              {/* PC 전용 소형 버튼 + 키보드 힌트 */}
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={filteredMoves.length === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-chess-border bg-chess-bg text-chess-primary hover:bg-chess-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                  aria-label="이전 수"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={filteredMoves.length === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-chess-border bg-chess-bg text-chess-primary hover:bg-chess-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                  aria-label="다음 수"
                >
                  ▶
                </button>
                <span className="text-[11px] text-chess-primary/70 border border-chess-border/60 bg-chess-bg rounded px-2 py-0.5 font-mono font-medium ml-1">←/→</span>
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
              />
            </div>

            {/* 엔진 평가 바 */}
            {selectedMove && (
              <div className="w-full max-w-[400px] xl:mx-0 flex items-stretch gap-3 rounded-xl bg-chess-surface border border-chess-border/80 shadow-sm p-2 sm:p-3">
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-[10px] uppercase tracking-widest text-chess-primary/70 font-bold mb-0.5">{t("ga.eval")}</span>
                  <span className="text-sm font-bold text-chess-primary font-mono whitespace-nowrap">
                    {selectedMove.cp_before !== null ? `${selectedMove.cp_before > 0 ? "+" : ""}${selectedMove.cp_before}` : "?"}
                    &nbsp;→&nbsp;
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
                className="flex-1 py-3 flex items-center justify-center rounded-xl border-2 border-chess-border bg-chess-bg text-chess-primary active:bg-chess-border/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-lg font-bold shadow-sm select-none"
                aria-label="이전 수"
              >
                ◀
              </button>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); goToNext(); }}
                disabled={filteredMoves.length === 0}
                style={{ touchAction: "manipulation" }}
                className="flex-1 py-3 flex items-center justify-center rounded-xl border-2 border-chess-border bg-chess-bg text-chess-primary active:bg-chess-border/40 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-lg font-bold shadow-sm select-none"
                aria-label="다음 수"
              >
                ▶
              </button>
            </div>
          </div>

          {/* 기보 패널 */}
          <div className="flex-1 flex flex-col min-w-0 bg-chess-bg rounded-2xl border border-chess-border shadow-sm overflow-hidden">
            {/* 티어 필터 탭: 모바일=가로 스크롤 1줄, PC=줄바꿈 */}
            <div className="border-b border-chess-border bg-chess-surface">
              <div className="flex sm:flex-wrap gap-1.5 p-2 sm:p-3 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setSelectedTier("all")}
                  className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm ${
                    selectedTier === "all"
                      ? "bg-chess-primary text-white"
                      : "bg-chess-bg text-chess-muted hover:bg-chess-border/40 hover:text-chess-primary border border-chess-border/50"
                  }`}
                >
                  {typeof t === "function" ? t("ga.all") : "전체"}
                  <span className="ml-1.5 font-normal opacity-80">({filteredMoves.length})</span>
                </button>
                {(["TH", "TF", "T1", "T2", "T3", "T4", "T5", "T6"] as MoveTier[]).map((tier) => {
                  const sel = selectedTier === tier;
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <button
                      key={tier}
                      onClick={() => setSelectedTier(tier)}
                      className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-bold transition-all border shadow-sm ${
                        sel ? "border-transparent text-white" : "bg-chess-bg border-chess-border/50 text-chess-muted hover:bg-chess-border/40 hover:text-chess-primary"
                      }`}
                      style={sel ? { backgroundColor: cfg.color } : {}}
                    >
                      {tier}
                    </button>
                  );
                })}
                {/* 등급 설명 토글 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowTierInfo((v) => !v)}
                  className={`shrink-0 ml-auto w-7 h-7 flex items-center justify-center rounded-full text-xs font-black border transition-all shadow-sm select-none ${
                    showTierInfo
                      ? "bg-chess-accent text-white border-chess-accent"
                      : "bg-chess-bg text-chess-muted border-chess-border/50 hover:text-chess-primary hover:border-chess-border"
                  }`}
                  aria-label="등급 설명 보기"
                >
                  ！
                </button>
              </div>
            </div>

            {/* 등급 설명 패널 */}
            {showTierInfo && (
              <div className="border-b border-chess-border bg-chess-surface/60 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {(["TH", "TF", "T1", "T2", "T3", "T4", "T5", "T6"] as MoveTier[]).map((tier) => {
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <div key={tier} className="flex items-center gap-1.5 py-0.5">
                      <span
                        className="shrink-0 w-7 text-center rounded text-[10px] font-black text-white py-0.5 leading-none"
                        style={{ backgroundColor: cfg.color }}
                      >
                        {tier}
                      </span>
                      <span className="text-[11px] font-semibold text-chess-primary whitespace-nowrap">{cfg.label}</span>
                      <span className="text-[10px] text-chess-muted truncate hidden sm:inline">— {cfg.desc}</span>
                    </div>
                  );
                })}
                <p className="col-span-2 text-[10px] text-chess-muted mt-1 sm:hidden">
                  TH 이론 · TF 강제 · T1 정점 · T2 최상 · T3 우수 · T4 양호 · T5 보통 · T6 폐기
                </p>
              </div>
            )}

            {/* 기보 목록 */}
            <div ref={moveListRef} className="overflow-y-auto divide-y divide-chess-border/40 max-h-[200px] sm:max-h-[480px]">
              {filteredMoves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-chess-primary/70 text-sm gap-3">
                  <span className="text-4xl opacity-50">📭</span>
                  <span className="font-semibold">{typeof t === "function" ? t("ga.noMoves") : "해당 등급의 수가 없습니다."}</span>
                </div>
              ) : (
                filteredMoves.map((move: AnalyzedMove) => {
                  const isSelected = selectedMove?.halfmove === move.halfmove;
                  const cfg = TIER_CONFIG[move.tier];
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
                        style={{ backgroundColor: cfg.color }}
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
                          <span className="shrink-0 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold whitespace-nowrap">
                            {t("ga.onlyBest")}
                          </span>
                        )}
                        {/* 손실% - 모바일: 오른쪽 끝에 작게, PC: 두 번째 줄 */}
                        <span className="ml-auto shrink-0 text-[10px] font-semibold text-chess-primary/70 sm:hidden tabular-nums">
                          {move.win_pct_loss.toFixed(1)}%
                        </span>
                        <p className="hidden sm:block text-[11px] font-semibold mt-0.5">
                          {move.tier === "TH" ? (
                            <span className="text-emerald-600/90 dark:text-emerald-400/90">
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
          <div className="rounded-xl border border-chess-border bg-chess-bg shadow-sm px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-chess-surface flex items-center justify-center border border-chess-border shrink-0 text-base leading-none">
              ♔
            </div>
            <span className="text-xs font-bold text-chess-primary truncate flex-1 min-w-0">{data.white_player}</span>
            <span className="text-[10px] text-chess-primary/60 uppercase shrink-0">{t("ga.white")}</span>
            <span className="text-base font-black text-chess-accent shrink-0 tabular-nums">{white.accuracy.toFixed(1)}%</span>
          </div>
          {/* 흑 */}
          <div className="rounded-xl border border-chess-border bg-chess-bg shadow-sm px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-chess-primary flex items-center justify-center border border-chess-primary/80 shrink-0 text-base leading-none text-white">
              ♚
            </div>
            <span className="text-xs font-bold text-chess-primary truncate flex-1 min-w-0">{data.black_player}</span>
            <span className="text-[10px] text-chess-primary/60 uppercase shrink-0">{t("ga.black")}</span>
            <span className="text-base font-black text-chess-accent shrink-0 tabular-nums">{black.accuracy.toFixed(1)}%</span>
          </div>
        </div>

        {/* PC 전용: 도넛 차트 포함 전체 카드 */}
        <div className="hidden sm:grid sm:grid-cols-2 gap-4">
          {/* 백 */}
          <div className="rounded-2xl border border-chess-border bg-chess-bg shadow-sm p-6 flex flex-col items-center">
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="w-10 h-10 rounded bg-chess-surface flex items-center justify-center shadow-sm shrink-0 border border-chess-border">
                <span className="text-chess-primary text-xl leading-none">♔</span>
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
              accuracy={white.accuracy}
              size={200}
              strokeWidth={18}
            />
          </div>

          {/* 흑 */}
          <div className="rounded-2xl border border-chess-border bg-chess-bg shadow-sm p-6 flex flex-col items-center">
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="w-10 h-10 rounded bg-chess-primary flex items-center justify-center shadow-sm shrink-0 border border-chess-primary/80">
                <span className="text-white text-xl leading-none">♚</span>
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
              accuracy={black.accuracy}
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
        <div key={i} className="rounded-2xl bg-chess-surface/90 border border-chess-border/50 p-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-chess-border/30 animate-pulse" />
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
        <span className="text-5xl select-none">♟️</span>
        <p className="text-sm">{t("dh.emptyState")}</p>
      </div>
    );
  }

  if (isLoading) return <GameListSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-chess-muted">
        <span className="text-4xl select-none">⚠️</span>
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
        <span className="text-4xl select-none">📭</span>
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
      <div className="bg-gradient-to-r from-chess-surface/80 to-chess-surface/60 border border-chess-border/50 rounded-2xl p-4 sm:p-6 shadow-lg">
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
                  <span className="text-base sm:text-lg font-bold text-emerald-800 dark:text-emerald-400">{wins}</span>
                  <span className="text-xs sm:text-sm text-emerald-700/90 dark:text-emerald-400/75">{t("gh.summary.win")}</span>
                </div>
                <div className="flex items-center gap-1 min-w-fit">
                  <span className="text-base sm:text-lg font-bold text-amber-900 dark:text-amber-400">{draws}</span>
                  <span className="text-xs sm:text-sm text-amber-800/90 dark:text-amber-400/75">{t("gh.summary.draw")}</span>
                </div>
                <div className="flex items-center gap-1 min-w-fit">
                  <span className="text-base sm:text-lg font-bold text-red-700 dark:text-red-400">{losses}</span>
                  <span className="text-xs sm:text-sm text-red-700/90 dark:text-red-400/75">{t("gh.summary.loss")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 승률 바와 퍼센트 */}
          <div className="text-right w-full sm:w-auto">
            <div className="text-xs sm:text-sm text-chess-muted mb-1.5 sm:mb-2">{t("gh.summary.winRate")}</div>
            <div className="flex items-center gap-3">
              <div className="flex-1 sm:flex-none sm:w-48 h-3 rounded-full overflow-hidden bg-chess-border/30 shadow-inner">
                {wins > 0  && <div style={{ width: `${wins  / games.length * 100}%` }} className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500" />}
                {draws > 0 && <div style={{ width: `${draws / games.length * 100}%` }} className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500" />}
                {losses > 0 && <div style={{ width: `${losses / games.length * 100}%` }} className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500" />}
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
            className="group relative px-6 py-3 rounded-xl font-medium text-chess-accent border border-chess-accent/40 bg-gradient-to-r from-chess-accent/20 to-chess-accent/10 shadow-lg transition-all duration-300 hover:scale-105 hover:border-chess-accent/60 hover:from-chess-accent/30 hover:to-chess-accent/20 hover:shadow-xl"
          >
            <span className="flex items-center gap-2">
              <span>{t("gh.btn.loadMore")}</span>
              <span className="text-chess-accent/70">(+30)</span>
              <span className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden>
                &rarr;
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
