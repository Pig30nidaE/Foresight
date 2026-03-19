"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

import { getRecentGamesList } from "../api";
import { analyzeGameBothPlayers } from "@/shared/lib/api";
import type { GameSummaryItem } from "../types";
import type { Platform, TimeClass, BothPlayersAnalysis, PlayerAnalysis, MoveTier, AnalyzedMove } from "@/shared/types";

// 도넛 차트 컴포넌트 import
import TierDonutChart from "./charts/TierDonutChart";
// 체스보드 컴포넌트 import
import ChessBoard from "./ChessBoard";
import { useTranslation, I18nKey } from "@/shared/lib/i18n";

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
function ResultBadge({ result, size = "md", t }: { result: GameSummaryItem["result"]; size?: "sm" | "md" | "lg", t: any }) {
  const map = {
    win:  { labelKey: "gh.card.win",  cls: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20", icon: "🏆" },
    loss: { labelKey: "gh.card.loss",  cls: "bg-gradient-to-br from-red-500/20 to-red-600/20 text-red-300 border-red-500/50 shadow-red-500/20", icon: "💔" },
    draw: { labelKey: "gh.card.draw",  cls: "bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 border-amber-500/50 shadow-amber-500/20", icon: "🤝" },
  } as const;
  const sz = { sm: "w-7 h-7 text-xs", md: "w-8 h-8 text-sm", lg: "w-10 h-10 text-base" };
  const { labelKey, cls, icon } = map[result];
  return (
    <div className={`inline-flex items-center justify-center rounded-lg font-bold border shadow-sm ${cls} ${sz[size]}`}>
      <span className="mr-1">{icon}</span>
      <span>{t(labelKey as I18nKey)}</span>
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
// 게임 카드 - 시각적으로 개선 + 게임 분석 기능
// ─────────────────────────────────────────────
function GameCard({ game, username }: { game: GameSummaryItem; username: string }) {
  // GameCard uses t from useTranslation so we keep it as hook-aware component
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState<BothPlayersAnalysis | null>(null);
  const [selectedTier, setSelectedTier] = useState<MoveTier | "all">("all");
  const [selectedMove, setSelectedMove] = useState<AnalyzedMove | null>(null);

  // 게임 분석 mutation (양쪽 플레이어 모두)
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!game.pgn) throw new Error("PGN 데이터가 없습니다");
      return analyzeGameBothPlayers(game.pgn, game.game_id, 0.15);
    },
    onSuccess: (data: BothPlayersAnalysis) => {
      setAnalysisData(data);
      const combined = [...(data.white_analysis.analyzed_moves ?? []), ...(data.black_analysis.analyzed_moves ?? [])]
        .sort((a, b) => a.halfmove - b.halfmove);
      if (combined.length > 0) setSelectedMove(combined[0]);
    },
  });

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

  const tcIcon: Record<string, string> = { bullet: "🔫", blitz: "⚡", rapid: "⏱", classical: "🕰" };

  const resultColor = {
    win:  "text-emerald-400",
    loss: "text-red-400",
    draw: "text-amber-400",
  }[game.result];

  const resultLabel = { win: t("gh.card.win"), loss: t("gh.card.loss"), draw: t("gh.card.draw") }[game.result];

  const resultBgGradient = {
    win:  "from-emerald-500/10 to-emerald-600/5 border-emerald-500/30",
    loss: "from-red-500/10 to-red-600/5 border-red-500/30",
    draw: "from-amber-500/10 to-amber-600/5 border-amber-500/30",
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
        className={`w-full p-4 transition-all duration-200 text-left ${
          open ? "bg-chess-surface/20" : "hover:bg-chess-surface/50"
        }`}
      >
        <div className="flex items-center gap-4">
          <ResultBadge result={game.result} size="lg" t={t} />
          
          {/* 메인 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-lg font-bold ${resultColor}`}>{resultLabel}</span>
              <span className="text-lg opacity-70">{tcIcon[game.time_class] ?? "♟"}</span>
              {ratingDiff !== null && (
                <span className={`text-sm font-semibold px-2 py-1 rounded-full bg-chess-bg/60 border ${
                  ratingDiff > 0 ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"
                }`}>
                  {ratingDiff > 0 ? "+" : ""}{ratingDiff}
                </span>
              )}
            </div>
            
            <div className="space-y-1">
              <p className="text-base font-semibold text-chess-primary truncate leading-tight">
                {game.opening_name ?? game.opening_eco ?? t("gh.card.noOpening")}
              </p>
              <div className="flex items-center gap-3 text-sm text-chess-muted">
                <span className="flex items-center gap-1">
                  <span className="text-base">{myIcon}</span>
                  <span className="font-medium text-chess-primary">{username}</span>
                  {myRating != null && <span className="text-chess-muted">({myRating})</span>}
                </span>
                <span className="opacity-40">vs</span>
                <span className="flex items-center gap-1">
                  <span className="text-base">{oppIcon}</span>
                  <span className="font-medium text-chess-primary">{opponent}</span>
                  {oppRating != null && <span className="text-chess-muted">({oppRating})</span>}
                </span>
              </div>
            </div>
          </div>
          
          {/* 우측 정보 */}
          <div className="flex flex-col items-end gap-2 text-sm">
            <div className="text-chess-muted font-medium">
              {dateStr}
            </div>
            <div className="text-chess-muted/70 text-xs">
              {timeStr}
            </div>
          </div>
          
          <span className={`text-chess-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {/* ── 상세 패널 ── */}
      {open && (
        <div className="border-t border-chess-border/30 bg-chess-surface/30">
          {/* 결과 요약 */}
          <div className={`px-6 py-4 bg-gradient-to-r ${resultBgGradient}`}>
            <div className="flex items-center justify-between">
              {/* 나 */}
              <div className="flex items-center gap-3">
                <span className={`text-2xl ${isWhite ? "text-chess-primary" : "text-chess-muted"}`}>{myIcon}</span>
                <div>
                  <p className="text-base font-bold text-chess-accent">{username}</p>
                <p className="text-sm text-chess-muted">{myColor} {myRating != null ? `· ${myRating} ${t("utils.ratingPts")}` : ""}</p>
                </div>
              </div>

              {/* 결과 */}
              <div className="text-center">
                <span className={`text-2xl font-bold ${resultColor}`}>{resultLabel}</span>
                {ratingDiff !== null && (
                  <p className="text-sm text-chess-muted mt-1">
                    {ratingDiff > 0 ? "+" : ""}{ratingDiff} {t("gh.card.diff")}
                  </p>
                )}
              </div>

              {/* 상대 */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-base font-bold text-chess-primary">{opponent}</p>
                  <p className="text-sm text-chess-muted">{isWhite ? t("gh.card.black") : t("gh.card.white")} {oppRating != null ? `· ${oppRating} ${t("utils.ratingPts")}` : ""}</p>
                </div>
                <span className={`text-2xl ${!isWhite ? "text-chess-primary" : "text-chess-muted"}`}>{oppIcon}</span>
              </div>
            </div>
          </div>

          {/* 게임 정보 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
            {terminationKey && (
              <div className="bg-chess-bg/40 rounded-lg p-3">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.term")}</p>
                <p className="text-sm font-semibold text-chess-primary">{t(terminationKey)}</p>
              </div>
            )}
            {moveCount != null && (
              <div className="bg-chess-bg/40 rounded-lg p-3">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.movesCount")}</p>
                <p className="text-sm font-semibold text-chess-primary">{moveCount} {t("gh.card.moves")}</p>
                {lengthLabel && <p className="text-xs text-chess-muted/70">({lengthLabel})</p>}
              </div>
            )}
            {timeControl && (
              <div className="bg-chess-bg/40 rounded-lg p-3">
                <p className="text-xs text-chess-muted mb-1">{t("gh.card.timeControl")}</p>
                <p className="text-sm font-semibold text-chess-primary">{timeControl}</p>
              </div>
            )}
            <div className="bg-chess-bg/40 rounded-lg p-3">
              <p className="text-xs text-chess-muted mb-1">{t("gh.card.playTime")}</p>
              <p className="text-sm font-semibold text-chess-primary">{dateStr}</p>
              <p className="text-xs text-chess-muted/70">{timeStr}</p>
            </div>
          </div>

          {/* 오프닝 정보 */}
          {game.opening_name && (
            <div className="px-6 pb-4">
              <div className="bg-chess-bg/30 rounded-lg p-4">
                <p className="text-xs text-chess-muted mb-2 font-semibold">{t("gh.card.opening")}</p>
                <p className="text-base text-chess-primary font-medium">{game.opening_name}</p>
                {game.opening_eco && (
                  <p className="text-sm text-chess-muted mt-1">{t("gh.card.ecoCode")}: {game.opening_eco}</p>
                )}
              </div>
            </div>
          )}

          {/* 외부 링크 */}
          {game.url && (
            <div className="px-6 pb-4">
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
            <div className="px-6 pb-4">
              <button
                onClick={() => {
                  setShowAnalysis(true);
                  if (!analysisData && !analyzeMutation.isPending) {
                    analyzeMutation.mutate();
                  }
                }}
                disabled={analyzeMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-chess-accent/20 to-chess-accent/10 hover:from-chess-accent/30 hover:to-chess-accent/20 text-chess-accent border border-chess-accent/40 hover:border-chess-accent/60 rounded-xl transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzeMutation.isPending ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>{t("gh.btn.analyzing")}</span>
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
            <div className="px-6 pb-6">
              {analyzeMutation.isError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {t("gh.analyze.error")}
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
// 게임 분석 패널 - 양쪽 플레이어 + T1~T5 탭 + 체스보드
// ─────────────────────────────────────────────
interface GameAnalysisPanelProps {
  data: BothPlayersAnalysis;
  selectedTier: MoveTier | "all";
  setSelectedTier: (tier: MoveTier | "all") => void;
  selectedMove: AnalyzedMove | null;
  setSelectedMove: (move: AnalyzedMove | null) => void;
  onClose: () => void;
}

const TIER_CONFIG: Record<MoveTier, { label: string; color: string; desc: string }> = {
  TH: { label: "이론", color: "#8b5cf6", desc: "오프닝 이론수" },
  T1: { label: "최상", color: "#10b981", desc: "유일 최선수" },
  T2: { label: "우수", color: "#34d399", desc: "엔진 1순위" },
  T3: { label: "양호", color: "#6ee7b7", desc: "엔진 2~3순위" },
  T4: { label: "보통", color: "#fbbf24", desc: "무난한 수" },
  T5: { label: "불량", color: "#ef4444", desc: "큰 실수" },
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
}: GameAnalysisPanelProps) {
  const { t, language } = useTranslation();
  const white: PlayerAnalysis = data.white_analysis;
  const black: PlayerAnalysis = data.black_analysis;

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

  // keyboard navigation (←/→)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (t as any)?.isContentEditable) return;
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

  // keep selected move visible in move list
  useEffect(() => {
    if (!selectedMove) return;
    const el = moveBtnRefs.current[selectedMove.halfmove];
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedMove]);

  const openingName = data.opening?.name;
  const openingEco = data.opening?.eco;
  const thFullMoves = data.opening?.th_fullmoves;

  return (
    <div className="space-y-4">
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
        <div className="rounded-xl border border-chess-border/40 bg-chess-bg/30 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-chess-primary">{t("ga.opening")}</span>
            <span className="text-chess-muted">
              {openingName ?? "—"}
              {openingEco ? <span className="ml-2 font-mono text-chess-muted/80">({openingEco})</span> : null}
            </span>
            {thFullMoves != null && (
              <span className="ml-auto rounded-full bg-chess-accent/12 border border-chess-accent/25 px-2.5 py-1 text-xs font-semibold text-chess-accent">
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
      <div className="space-y-5">
        {/* ─── 상단: 보드(좌) + 기보(우) ─── */}
        <div className="flex flex-col xl:flex-row gap-5">

          {/* 체스보드 영역 */}
          <div className="flex flex-col items-center gap-4">
            {/* 수 정보 헤더 */}
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedMove ? (
                  <>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-chess-bg text-chess-primary border border-chess-border shadow-sm">
                      {selectedMove.move_number}. {selectedMove.san}
                    </span>
                    <span
                      className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-black text-white shadow-sm"
                      style={{ backgroundColor: TIER_CONFIG[selectedMove.tier].color }}
                    >
                      {selectedMove.tier}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-chess-primary/80 font-semibold">{typeof t === "function" ? t("ga.board") : "체스보드"}</span>
                )}
              </div>
              <span className="text-[11px] text-chess-primary/70 border border-chess-border/60 bg-chess-bg rounded px-2 py-0.5 font-mono font-medium">←/→</span>
            </div>

            {/* 보드 */}
            <ChessBoard
              fen={selectedMove?.fen_before || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
              size={400}
              lastMove={selectedMove ? {
                from: selectedMove.uci.substring(0, 2),
                to: selectedMove.uci.substring(2, 4),
              } : undefined}
              orientation="white"
            />

            {/* 엔진 평가 바 */}
            {selectedMove && (
              <div className="w-full flex items-stretch gap-3 rounded-xl bg-chess-surface border border-chess-border/80 shadow-sm p-3">
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
          </div>

          {/* 기보 패널 */}
          <div className="flex-1 flex flex-col min-w-0 bg-chess-bg rounded-2xl border border-chess-border shadow-sm overflow-hidden">
            {/* 티어 필터 탭 */}
            <div className="flex flex-wrap gap-1.5 p-3 border-b border-chess-border bg-chess-surface">
              <button
                onClick={() => setSelectedTier("all")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm ${
                  selectedTier === "all"
                    ? "bg-chess-primary text-white"
                    : "bg-chess-bg text-chess-muted hover:bg-chess-border/40 hover:text-chess-primary border border-chess-border/50"
                }`}
              >
                {typeof t === "function" ? t("ga.all") : "전체"}
                <span className="ml-1.5 font-normal opacity-80">({filteredMoves.length})</span>
              </button>
              {(["TH", "T1", "T2", "T3", "T4", "T5"] as MoveTier[]).map((tier) => {
                const sel = selectedTier === tier;
                const cfg = TIER_CONFIG[tier];
                return (
                  <button
                    key={tier}
                    onClick={() => setSelectedTier(tier)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border shadow-sm ${
                      sel ? "border-transparent text-white" : "bg-chess-bg border-chess-border/50 text-chess-muted hover:bg-chess-border/40 hover:text-chess-primary"
                    }`}
                    style={sel ? { backgroundColor: cfg.color } : {}}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>

            {/* 기보 목록 */}
            <div className="flex-1 overflow-y-auto divide-y divide-chess-border/40" style={{ maxHeight: 480 }}>
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
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isSelected ? "bg-chess-accent/10 border-l-4 border-l-chess-accent" : "hover:bg-chess-surface/60 border-l-4 border-l-transparent"
                      }`}
                    >
                      {/* 색 인디케이터 */}
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] shrink-0 font-bold border shadow-sm ${
                          move.color === "white"
                            ? "bg-white text-gray-800 border-gray-200"
                            : "bg-gray-800 text-white border-gray-900"
                        }`}
                      >
                        {move.color === "white" ? "W" : "B"}
                      </div>
                      {/* 티어 뱃지 */}
                      <span
                        className="w-8 text-center shrink-0 rounded text-[10px] font-black py-0.5 text-white shadow-sm"
                        style={{ backgroundColor: cfg.color }}
                      >
                        {move.tier}
                      </span>
                      {/* SAN + 통계 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`text-sm font-bold ${isSelected ? "text-chess-primary" : "text-chess-primary/80"}`}>
                            {move.move_number}. {move.san}
                          </span>
                          {move.is_only_best && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold whitespace-nowrap">
                              {t("ga.onlyBest")}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-chess-primary/80 font-semibold">
                          엔진 {move.user_move_rank}위 &middot; {move.win_pct_loss.toFixed(1)}% 손실
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ─── 하단: 양 플레이어 차트 ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 백 */}
          <div className="rounded-2xl border border-chess-border bg-chess-bg shadow-sm p-6 flex flex-col items-center">
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="w-10 h-10 rounded bg-chess-surface flex items-center justify-center shadow-sm shrink-0 border border-chess-border">
                <span className="text-chess-primary text-xl leading-none">♔</span>
              </div>
              <div>
                <p className="text-base font-bold text-chess-primary">{data.white_player}</p>
                <p className="text-xs text-chess-primary/70 font-bold uppercase tracking-wider">{t("ga.white")}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-2xl font-black text-chess-accent">{white.accuracy.toFixed(1)}%</p>
                <p className="text-[10px] text-chess-primary/70 font-bold uppercase tracking-widest">{t("ga.accuracy")}</p>
              </div>
            </div>
            {/* The Donut chart colors can remain whatever they internally use, 
                just passing the correct sizing */}
            <TierDonutChart
              tierPercentages={white.tier_percentages}
              tierCounts={white.tier_counts}
              accuracy={white.accuracy}
              size={220}
              strokeWidth={20}
            />
          </div>

          {/* 흑 */}
          <div className="rounded-2xl border border-chess-border bg-chess-bg shadow-sm p-6 flex flex-col items-center">
            <div className="flex items-center gap-3 w-full mb-6">
              <div className="w-10 h-10 rounded bg-chess-primary flex items-center justify-center shadow-sm shrink-0 border border-chess-primary/80">
                <span className="text-white text-xl leading-none">♚</span>
              </div>
              <div>
                <p className="text-base font-bold text-chess-primary">{data.black_player}</p>
                <p className="text-xs text-chess-primary/70 font-bold uppercase tracking-wider">{t("ga.black")}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-2xl font-black text-chess-accent">{black.accuracy.toFixed(1)}%</p>
                <p className="text-[10px] text-chess-primary/70 font-bold uppercase tracking-widest">{t("ga.accuracy")}</p>
              </div>
            </div>
            <TierDonutChart
              tierPercentages={black.tier_percentages}
              tierCounts={black.tier_counts}
              accuracy={black.accuracy}
              size={220}
              strokeWidth={20}
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
    staleTime: 60_000,
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
    <div className="space-y-6">
      {/* 결과 요약 헤더 - 더 시각적으로 개선 */}
      <div className="bg-gradient-to-r from-chess-surface/80 to-chess-surface/60 border border-chess-border/50 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-chess-primary mb-2">{t("gh.summary.title")}</h3>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-chess-muted">{t("gh.summary.total")}</span>
                <span className="text-xl font-bold text-chess-primary">{games.length}</span>
                <span className="text-chess-muted">{t("gh.summary.game")}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400 font-bold text-lg">{wins}</span>
                  <span className="text-emerald-400/70 text-sm">{t("gh.summary.win")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-amber-400 font-bold text-lg">{draws}</span>
                  <span className="text-amber-400/70 text-sm">{t("gh.summary.draw")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-400 font-bold text-lg">{losses}</span>
                  <span className="text-red-400/70 text-sm">{t("gh.summary.loss")}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 승률 바와 퍼센트 */}
          <div className="text-right">
            <div className="text-sm text-chess-muted mb-2">{t("gh.summary.winRate")}</div>
            <div className="flex items-center gap-3">
              <div className="w-48 h-3 rounded-full overflow-hidden bg-chess-border/30 shadow-inner">
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

      {/* 더 보기 버튼 - 더 세련되게 */}
      {games.length >= maxGames && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setMaxGames((p) => p + 30)}
            className="group relative px-6 py-3 bg-gradient-to-r from-chess-accent/20 to-chess-accent/10 hover:from-chess-accent/30 hover:to-chess-accent/20 text-chess-accent border border-chess-accent/40 hover:border-chess-accent/60 rounded-xl transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <span className="flex items-center gap-2">
              <span>{t("gh.btn.loadMore")}</span>
              <span className="text-chess-accent/70">(+30)</span>
              <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
