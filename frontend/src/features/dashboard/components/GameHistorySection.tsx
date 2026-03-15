"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

import { getRecentGamesList } from "../api";
import { analyzeGameBothPlayers } from "@/shared/lib/api";
import type { GameSummaryItem } from "../types";
import type { Platform, TimeClass, BothPlayersAnalysis, PlayerAnalysis, MoveTier, AnalyzedMove } from "@/shared/types";

// 도넛 차트 컴포넌트 import
import TierDonutChart from "./charts/TierDonutChart";
// 체스보드 컴포넌트 import
import ChessBoard from "./ChessBoard";

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

function getTerminationKo(pgn: string, platform: string): string | null {
  const term = parsePgnHeader(pgn, "Termination");
  if (!term) return null;
  const t = term.toLowerCase();
  if (t.includes("checkmate"))        return "체크메이트";
  if (t.includes("resignation"))      return "기권";
  if (t.includes("time"))             return "시간 초과";
  if (t.includes("stalemate"))        return "스테일메이트";
  if (t.includes("repetition"))       return "반복";
  if (t.includes("insufficient"))     return "기물 부족";
  if (t.includes("50") || t.includes("fifty")) return "50수 규칙";
  if (t.includes("agreed") || t.includes("draw")) return "합의 무승부";
  if (t.includes("abandoned"))        return "연결 끊김";
  // lichess  "Normal" 은 그냥 제외
  if (t === "normal")                 return null;
  return null;
}

function getGameLengthLabel(moves: number): string {
  if (moves < 15) return "초단기";
  if (moves < 25) return "단기";
  if (moves < 40) return "중간";
  if (moves < 60) return "장기";
  return "초장기";
}

function getTimeControl(pgn: string): string | null {
  const tc = parsePgnHeader(pgn, "TimeControl");
  if (!tc || tc === "-") return null;
  // "600+5" → "10분 +5초"
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return tc;
  const base = parseInt(m[1]);
  const inc  = m[2] ? parseInt(m[2]) : 0;
  const mins = Math.floor(base / 60);
  const secs = base % 60;
  const baseStr = mins > 0 ? `${mins}분${secs > 0 ? ` ${secs}초` : ""}` : `${secs}초`;
  return inc > 0 ? `${baseStr} +${inc}초` : baseStr;
}

// ─────────────────────────────────────────────
// 결과 배지 - 더 시각적으로 개선
// ─────────────────────────────────────────────
function ResultBadge({ result, size = "md" }: { result: GameSummaryItem["result"]; size?: "sm" | "md" | "lg" }) {
  const map = {
    win:  { label: "승",  cls: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20", icon: "🏆" },
    loss: { label: "패",  cls: "bg-gradient-to-br from-red-500/20 to-red-600/20 text-red-300 border-red-500/50 shadow-red-500/20", icon: "💔" },
    draw: { label: "무",  cls: "bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 border-amber-500/50 shadow-amber-500/20", icon: "🤝" },
  } as const;
  const sz = { sm: "w-7 h-7 text-xs", md: "w-8 h-8 text-sm", lg: "w-10 h-10 text-base" };
  const { label, cls, icon } = map[result];
  return (
    <div className={`inline-flex items-center justify-center rounded-lg font-bold border shadow-sm ${cls} ${sz[size]}`}>
      <span className="mr-1">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// 게임 카드 - 시각적으로 개선 + 게임 분석 기능
// ─────────────────────────────────────────────
function GameCard({ game, username }: { game: GameSummaryItem; username: string }) {
  const [open, setOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState<BothPlayersAnalysis | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<"white" | "black">("white");
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
      // 현재 사용자가 흑/백 중 어디인지 확인하여 기본 선택
      const isWhite = data.white_analysis.username.toLowerCase() === username.toLowerCase();
      setSelectedPlayer(isWhite ? "white" : "black");
    },
  });

  const isWhite = game.white.toLowerCase() === username.toLowerCase();
  const myColor  = isWhite ? "백" : "흑";
  const myIcon   = isWhite ? "♔" : "♚";
  const oppIcon  = isWhite ? "♚" : "♔";
  const opponent = isWhite ? game.black : game.white;

  const myRating  = isWhite ? game.rating_white  : game.rating_black;
  const oppRating = isWhite ? game.rating_black  : game.rating_white;
  const ratingDiff = (myRating != null && oppRating != null) ? myRating - oppRating : null;

  const dateStr = game.played_at
    ? new Date(game.played_at).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
    : "—";
  const timeStr = game.played_at
    ? new Date(game.played_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";

  const pgn = game.pgn ?? "";
  const moveCount  = getMoveCount(pgn);
  const termination = getTerminationKo(pgn, game.platform);
  const timeControl = getTimeControl(pgn);
  const lengthLabel = moveCount != null ? getGameLengthLabel(moveCount) : null;

  const tcIcon: Record<string, string> = { bullet: "🔫", blitz: "⚡", rapid: "⏱", classical: "🕰" };

  const resultColor = {
    win:  "text-emerald-400",
    loss: "text-red-400",
    draw: "text-amber-400",
  }[game.result];

  const resultLabel = { win: "승리", loss: "패배", draw: "무승부" }[game.result];

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
          <ResultBadge result={game.result} size="lg" />
          
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
                {game.opening_name ?? game.opening_eco ?? "오프닝 정보 없음"}
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
                  <p className="text-sm text-chess-muted">{myColor} {myRating != null ? `· ${myRating}점` : ""}</p>
                </div>
              </div>

              {/* 결과 */}
              <div className="text-center">
                <span className={`text-2xl font-bold ${resultColor}`}>{resultLabel}</span>
                {ratingDiff !== null && (
                  <p className="text-sm text-chess-muted mt-1">
                    {ratingDiff > 0 ? "+" : ""}{ratingDiff}점 차이
                  </p>
                )}
              </div>

              {/* 상대 */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-base font-bold text-chess-primary">{opponent}</p>
                  <p className="text-sm text-chess-muted">{isWhite ? "흑" : "백"} {oppRating != null ? `· ${oppRating}점` : ""}</p>
                </div>
                <span className={`text-2xl ${!isWhite ? "text-chess-primary" : "text-chess-muted"}`}>{oppIcon}</span>
              </div>
            </div>
          </div>

          {/* 게임 정보 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
            {termination && (
              <div className="bg-chess-bg/40 rounded-lg p-3">
                <p className="text-xs text-chess-muted mb-1">종료 방식</p>
                <p className="text-sm font-semibold text-chess-primary">{termination}</p>
              </div>
            )}
            {moveCount != null && (
              <div className="bg-chess-bg/40 rounded-lg p-3">
                <p className="text-xs text-chess-muted mb-1">게임 수</p>
                <p className="text-sm font-semibold text-chess-primary">{moveCount}수</p>
                {lengthLabel && <p className="text-xs text-chess-muted/70">({lengthLabel})</p>}
              </div>
            )}
            {timeControl && (
              <div className="bg-chess-bg/40 rounded-lg p-3">
                <p className="text-xs text-chess-muted mb-1">시간 제한</p>
                <p className="text-sm font-semibold text-chess-primary">{timeControl}</p>
              </div>
            )}
            <div className="bg-chess-bg/40 rounded-lg p-3">
              <p className="text-xs text-chess-muted mb-1">플레이 시간</p>
              <p className="text-sm font-semibold text-chess-primary">{dateStr}</p>
              <p className="text-xs text-chess-muted/70">{timeStr}</p>
            </div>
          </div>

          {/* 오프닝 정보 */}
          {game.opening_name && (
            <div className="px-6 pb-4">
              <div className="bg-chess-bg/30 rounded-lg p-4">
                <p className="text-xs text-chess-muted mb-2 font-semibold">오프닝</p>
                <p className="text-base text-chess-primary font-medium">{game.opening_name}</p>
                {game.opening_eco && (
                  <p className="text-sm text-chess-muted mt-1">ECO 코드: {game.opening_eco}</p>
                )}
              </div>
            </div>
          )}

          {/* 외부 링크 */}
          {game.url && (
            <div className="px-6 pb-4">
              <a
                href={game.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-chess-accent/10 hover:bg-chess-accent/20 text-chess-accent hover:text-chess-accent/80 border border-chess-accent/30 hover:border-chess-accent/50 rounded-lg transition-all duration-200 font-medium text-sm"
              >
                🔗 게임 직접 보기 ({game.platform === "chess.com" ? "Chess.com" : "Lichess"})
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
                    <span>Stockfish 분석 중... (30초~1분)</span>
                  </>
                ) : (
                  <>
                    <span>🎯</span>
                    <span>게임 분석하기 (T1~T5 등급)</span>
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
                  ❌ 분석 중 오류가 발생했습니다. 다시 시도해주세요.
                </div>
              )}
              
              {analysisData && (
                <GameAnalysisPanel 
                  data={analysisData}
                  selectedPlayer={selectedPlayer}
                  setSelectedPlayer={setSelectedPlayer}
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
  selectedPlayer: "white" | "black";
  setSelectedPlayer: (player: "white" | "black") => void;
  selectedTier: MoveTier | "all";
  setSelectedTier: (tier: MoveTier | "all") => void;
  selectedMove: AnalyzedMove | null;
  setSelectedMove: (move: AnalyzedMove | null) => void;
  onClose: () => void;
}

const TIER_CONFIG: Record<MoveTier, { label: string; color: string; desc: string }> = {
  T1: { label: "최상", color: "#10b981", desc: "유일 최선수" },
  T2: { label: "우수", color: "#34d399", desc: "엔진 1순위" },
  T3: { label: "양호", color: "#6ee7b7", desc: "엔진 2~3순위" },
  T4: { label: "보통", color: "#fbbf24", desc: "무난한 수" },
  T5: { label: "불량", color: "#ef4444", desc: "큰 실수" },
};

function GameAnalysisPanel({
  data,
  selectedPlayer,
  setSelectedPlayer,
  selectedTier,
  setSelectedTier,
  selectedMove,
  setSelectedMove,
  onClose,
}: GameAnalysisPanelProps) {
  const currentAnalysis: PlayerAnalysis = selectedPlayer === "white" 
    ? data.white_analysis 
    : data.black_analysis;
  
  const otherPlayer = selectedPlayer === "white" ? "black" : "white";
  const otherAnalysis = selectedPlayer === "white" 
    ? data.black_analysis 
    : data.white_analysis;

  // 필터링된 수 목록
  const filteredMoves = selectedTier === "all" 
    ? currentAnalysis.analyzed_moves 
    : (currentAnalysis.moves_by_tier[selectedTier] || []);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-chess-primary">
          📊 양쪽 플레이어 분석
        </h4>
        <button
          onClick={onClose}
          className="text-chess-muted hover:text-chess-primary transition-colors"
        >
          ✕ 닫기
        </button>
      </div>

      {/* 플레이어 선택 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedPlayer("white")}
          className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
            selectedPlayer === "white"
              ? "bg-white text-black shadow-lg"
              : "bg-chess-surface/50 text-chess-muted hover:bg-chess-surface"
          }`}
        >
          <span className="mr-2">♔</span>
          백: {data.white_player}
          <span className="ml-2 text-sm opacity-80">
            ({data.white_analysis.accuracy}%)
          </span>
        </button>
        <button
          onClick={() => setSelectedPlayer("black")}
          className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
            selectedPlayer === "black"
              ? "bg-black text-white shadow-lg border border-gray-700"
              : "bg-chess-surface/50 text-chess-muted hover:bg-chess-surface"
          }`}
        >
          <span className="mr-2">♚</span>
          흑: {data.black_player}
          <span className="ml-2 text-sm opacity-80">
            ({data.black_analysis.accuracy}%)
          </span>
        </button>
      </div>

      {/* 메인 레이아웃: 좌측 체스보드 + 우측 분석 정보 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 좌측: 체스보드 */}
        <div className="bg-chess-bg/40 rounded-xl p-4 flex flex-col items-center">
          <h5 className="text-sm font-bold text-chess-primary mb-3">
            체스보드
            {selectedMove && (
              <span className="ml-2 font-normal text-chess-muted">
                - {selectedMove.move_number}. {selectedMove.san}
              </span>
            )}
          </h5>
          <ChessBoard 
            fen={selectedMove?.fen_before || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
            size={280}
            lastMove={selectedMove ? { 
              from: selectedMove.uci.substring(0, 2), 
              to: selectedMove.uci.substring(2, 4) 
            } : undefined}
            orientation={selectedPlayer}
          />
          {selectedMove && (
            <div className="mt-3 text-xs text-chess-muted text-center">
              <p>평가: {selectedMove.cp_before !== null ? `${selectedMove.cp_before > 0 ? "+" : ""}${selectedMove.cp_before}` : "?"} 
                 → {selectedMove.cp_after !== null ? `${selectedMove.cp_after > 0 ? "+" : ""}${selectedMove.cp_after}` : "?"}</p>
              <p>승률 손실: {selectedMove.win_pct_loss.toFixed(1)}%</p>
            </div>
          )}
        </div>

        {/* 우측: 원형 그래프 + T1~T5 탭 */}
        <div className="space-y-4">
          {/* 원형 그래프 */}
          <div className="bg-chess-bg/40 rounded-xl p-4">
            <TierDonutChart
              tierPercentages={currentAnalysis.tier_percentages}
              tierCounts={currentAnalysis.tier_counts}
              accuracy={currentAnalysis.accuracy}
              size={160}
              strokeWidth={20}
            />
          </div>

          {/* T1~T5 탭 */}
          <div className="bg-chess-bg/40 rounded-xl p-4">
            <h5 className="text-sm font-bold text-chess-primary mb-3">
              등급별 필터
            </h5>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedTier("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedTier === "all"
                    ? "bg-chess-accent text-white"
                    : "bg-chess-surface/50 text-chess-muted hover:bg-chess-surface"
                }`}
              >
                전체 ({currentAnalysis.total_moves})
              </button>
              {( ["T1", "T2", "T3", "T4", "T5"] as MoveTier[] ).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedTier === tier
                      ? "text-white shadow-md"
                      : "bg-chess-surface/50 text-chess-muted hover:bg-chess-surface"
                  }`}
                  style={{
                    backgroundColor: selectedTier === tier ? TIER_CONFIG[tier].color : undefined,
                  }}
                >
                  {tier} ({currentAnalysis.tier_counts[tier] || 0})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 수 목록 (필터링된) */}
      <div className="bg-chess-bg/40 rounded-xl p-4">
        <h5 className="text-sm font-bold text-chess-primary mb-3">
          {selectedTier === "all" ? "전체 수" : `${selectedTier} 등급 수`} 
          <span className="text-chess-muted font-normal ml-2">
            ({filteredMoves.length}개)
          </span>
        </h5>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filteredMoves.length === 0 ? (
            <p className="text-sm text-chess-muted text-center py-4">
              해당 등급의 수가 없습니다.
            </p>
          ) : (
            filteredMoves.map((move: AnalyzedMove) => (
              <button
                key={move.halfmove}
                onClick={() => setSelectedMove(move)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-all text-left ${
                  selectedMove?.halfmove === move.halfmove
                    ? "bg-chess-accent/20 border-chess-accent"
                    : "bg-chess-surface/30 border-chess-border/20 hover:bg-chess-surface/50"
                }`}
              >
                {/* 등급 배지 */}
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: TIER_CONFIG[move.tier].color }}
                >
                  {move.tier}
                </div>
                
                {/* 수 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-chess-primary">
                      {move.move_number}. {move.san}
                    </span>
                    {move.is_only_best && (
                      <span className="text-xs text-emerald-400">★ 유일 최선</span>
                    )}
                  </div>
                  <div className="text-xs text-chess-muted">
                    엔진 {move.user_move_rank}위 · {move.win_pct_loss.toFixed(1)}% 손실
                  </div>
                </div>

                {/* 평가 변화 */}
                <div className="text-right text-xs">
                  <div className="text-chess-muted">
                    {move.cp_before !== null ? `${move.cp_before > 0 ? "+" : ""}${move.cp_before}` : "?"}
                    →
                    {move.cp_after !== null ? `${move.cp_after > 0 ? "+" : ""}${move.cp_after}` : "?"}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 상대 플레이어 간략 정보 */}
      <div className="bg-chess-bg/30 rounded-xl p-4 border border-chess-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{otherPlayer === "white" ? "♔" : "♚"}</span>
            <span className="text-sm font-medium text-chess-primary">
              {otherAnalysis.username}의 분석
            </span>
          </div>
          <button
            onClick={() => setSelectedPlayer(otherPlayer)}
            className="text-xs text-chess-accent hover:underline"
          >
            보기 →
          </button>
        </div>
        <div className="mt-2 text-xs text-chess-muted">
          정확도: {otherAnalysis.accuracy}% · 
          평균 손실: {otherAnalysis.avg_cp_loss}cp
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
        <p className="text-sm">유저명을 입력하고 분석을 시작하세요.</p>
      </div>
    );
  }

  if (isLoading) return <GameListSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-chess-muted">
        <span className="text-4xl select-none">⚠️</span>
        <p className="text-sm">게임 데이터를 불러오는 중 오류가 발생했습니다.</p>
        <button onClick={() => refetch()} className="text-xs text-chess-accent hover:underline">
          다시 시도
        </button>
      </div>
    );
  }

  if (!games || games.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-chess-muted">
        <span className="text-4xl select-none">📭</span>
        <p className="text-sm">해당 기간에 게임이 없습니다.</p>
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
            <h3 className="text-lg font-bold text-chess-primary mb-2">전적 요약</h3>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-chess-muted">총</span>
                <span className="text-xl font-bold text-chess-primary">{games.length}</span>
                <span className="text-chess-muted">게임</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400 font-bold text-lg">{wins}</span>
                  <span className="text-emerald-400/70 text-sm">승</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-amber-400 font-bold text-lg">{draws}</span>
                  <span className="text-amber-400/70 text-sm">무</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-400 font-bold text-lg">{losses}</span>
                  <span className="text-red-400/70 text-sm">패</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 승률 바와 퍼센트 */}
          <div className="text-right">
            <div className="text-sm text-chess-muted mb-2">승률</div>
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
              <span>게임 더 보기</span>
              <span className="text-chess-accent/70">(+30)</span>
              <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
