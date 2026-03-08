"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";
import type { TacticalPattern, PatternGameItem } from "@/features/dashboard/types";

// ─── Chess.com 분석 URL ─────────────────────────────────────
function toAnalysisUrl(url: string): string {
  if (!url) return url;
  const m = url.match(/^(https?:\/\/(?:www\.)?chess\.com)\/game\/(live|daily)\/(\w+)/);
  if (m) return `${m[1]}/analysis/game/${m[2]}/${m[3]}/analysis`;
  if (/lichess\.org\/[A-Za-z0-9]+/.test(url)) return url.replace(/(\?.*)?$/, "#analysis");
  return url;
}

// ─── PGN 파싱 → 주변 수 스텝 배열 ──────────────────────────
interface BoardStep {
  fen: string;
  label: string;
  isSacrifice: boolean;
  san?: string;
  arrows: Arrow[];
}

function parseBoardSteps(
  pgn: string,
  moveNo: number,
  color: "white" | "black",
): BoardStep[] | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    const sacIdx = color === "white" ? (moveNo - 1) * 2 : (moveNo - 1) * 2 + 1;
    if (sacIdx >= history.length) return null;

    const startIdx = Math.max(0, sacIdx - 2);
    const endIdx   = Math.min(history.length, sacIdx + 3);

    const base = new Chess();
    for (let i = 0; i < startIdx; i++) base.move(history[i]);

    const steps: BoardStep[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      // isSacrifice = 희생 수가 실행된 후의 포지션 (sacIdx+1)
      const isSac  = i === sacIdx + 1;
      const isPreSac = i === sacIdx;          // 희생 직전 (화살표 표시)
      const rel    = i - (sacIdx + 1);        // after-sac 기준 거리
      const label  = isSac    ? `${moveNo}수 희생`
                   : isPreSac ? `희생 직전`
                   : rel < 0  ? `희생 ${-(rel)}수 전`
                   : `희생 후 ${rel}수`;
      // 희생 직전 칸에서만 화살표로 희생 수 예고
      const arrows: Arrow[] =
        isPreSac && sacIdx < history.length
          ? [{ startSquare: history[sacIdx].from, endSquare: history[sacIdx].to, color: "rgba(251,191,36,0.75)" }]
          : [];
      steps.push({ fen: base.fen(), label, isSacrifice: isSac, san: i < history.length ? history[i].san : undefined, arrows });
      if (i < endIdx && i < history.length) base.move(history[i]);
    }
    return steps;
  } catch {
    return null;
  }
}

// ─── 도넛 차트 ───────────────────────────────────────────────
function SacDonutChart({ successCount, failCount }: { successCount: number; failCount: number }) {
  const total = successCount + failCount;
  const rate = total > 0 ? Math.round((successCount / total) * 100) : 0;
  const color = rate >= 65 ? "#16a34a" : rate >= 45 ? "#d97706" : "#dc2626";

  const data = [
    { name: "유효 희생", value: successCount },
    { name: "무효 희생", value: Math.max(failCount, 0) },
  ];
  const COLORS = [color, "#374151"];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 120, height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={55}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val, name) => [`${val}건`, `${name}`]}
              contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: 8, fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* 중앙 텍스트 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-black" style={{ color }}>{rate}%</span>
          <span className="text-[9px] text-chess-muted">정확도</span>
        </div>
      </div>
      {/* 범례 */}
      <div className="flex gap-3 text-xs">
        <span className="flex items-center gap-1" style={{ color }}>
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
          유효 {successCount}
        </span>
        <span className="flex items-center gap-1 text-chess-muted">
          <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />
          무효 {failCount}
        </span>
      </div>
    </div>
  );
}

// ─── 체스보드 + 네비게이션 패널 (오른쪽 패널) ──────────────
function SacrificeBoardPanel({ game, onClose }: { game: PatternGameItem; onClose: () => void }) {
  const hasSacData = !!(game.pgn && game.sacrifice_move_no && game.sacrifice_color);
  const steps = useMemo(
    () => hasSacData ? parseBoardSteps(game.pgn!, game.sacrifice_move_no!, game.sacrifice_color!) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.pgn, game.sacrifice_move_no, game.sacrifice_color]
  );
  const sacRelIdx = useMemo(() => {
    if (!steps) return 0;
    const idx = steps.findIndex((s) => s.isSacrifice);
    return idx >= 0 ? idx : 0;
  }, [steps]);

  const [stepIdx, setStepIdx] = useState(() => Math.max(0, sacRelIdx - 1));
  const [animKey, setAnimKey] = useState(0);

  // 키보드 방향키로 수 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  setStepIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setStepIdx((i) => Math.min((steps?.length ?? 1) - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps]);

  useEffect(() => {
    if (!steps || steps.length === 0) return;
    const preIdx = Math.max(0, sacRelIdx - 1);
    setStepIdx(preIdx);
    const t = setTimeout(() => setStepIdx(sacRelIdx), 950);
    return () => clearTimeout(t);
  }, [animKey, steps, sacRelIdx]);

  if (!hasSacData || !steps) {
    return (
      <div className="flex flex-col h-full gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-chess-muted">PGN 데이터 없음</span>
          <button onClick={onClose} className="text-chess-muted hover:text-chess-primary text-lg">✕</button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <a href={toAnalysisUrl(game.url)} target="_blank" rel="noopener noreferrer"
            className="text-xs text-chess-muted hover:text-chess-primary underline underline-offset-2">
            Chess.com에서 분석 보기 →
          </a>
        </div>
      </div>
    );
  }

  const cur  = steps[stepIdx];
  const orientation: "white" | "black" = game.sacrifice_color === "white" ? "white" : "black";

  return (
    <div className="flex flex-col gap-3">
      {/* 게임 정보 헤더 */}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-chess-primary truncate">{game.opening_name ?? "보드"}</p>
          <p className="text-[10px] text-chess-muted">
            {game.played_at ? new Date(game.played_at).toLocaleDateString("ko-KR", { year:"numeric", month:"short", day:"numeric" }) : ""}
            {game.white && game.black && <span className="ml-1">{game.white} vs {game.black}</span>}
          </p>
        </div>
        <button onClick={onClose} className="shrink-0 text-chess-muted hover:text-chess-primary text-lg leading-none ml-2">✕</button>
      </div>

      {/* 보드 — 고정 크기로 스크롤 없이 표시 */}
      <div className="w-full max-w-[260px] mx-auto">
        <Chessboard options={{
          position: cur.fen, boardOrientation: orientation, allowDragging: false,
          arrows: cur.arrows, animationDurationInMs: 400, showAnimations: true,
          boardStyle: { borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.45)", width: "100%", aspectRatio: "1" },
          darkSquareStyle: { backgroundColor: "#4a5568" }, lightSquareStyle: { backgroundColor: "#e2e8f0" },
        }} />
      </div>

      {/* 현재 수 레이블 */}
      <div className="flex items-center justify-center gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
          cur.isSacrifice ? "bg-amber-600/20 text-amber-600 border-amber-600/30" : "text-chess-muted border-chess-border"
        }`}>{cur.label}</span>
        {cur.san && <span className="text-[11px] font-mono text-chess-muted">{cur.san}</span>}
      </div>

      {/* 이전/다음/다시보기 버튼 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0}
            className="px-3 py-1.5 rounded-lg border border-chess-border text-xs text-chess-muted
                       hover:text-chess-primary hover:border-chess-muted transition-colors
                       disabled:opacity-30 disabled:cursor-not-allowed">← 이전</button>
          <button onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))} disabled={stepIdx === steps.length - 1}
            className="px-3 py-1.5 rounded-lg border border-chess-border text-xs text-chess-muted
                       hover:text-chess-primary hover:border-chess-muted transition-colors
                       disabled:opacity-30 disabled:cursor-not-allowed">다음 →</button>
        </div>
        <button onClick={() => setAnimKey((k) => k + 1)}
          className="px-3 py-1.5 rounded-lg border border-amber-600/30 text-xs text-amber-600 hover:bg-amber-600/10 transition-colors">
          ↺ 다시 보기
        </button>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex items-center justify-center gap-1.5">
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStepIdx(i)} title={s.label}
            className={`rounded-full transition-all ${
              i === stepIdx
                ? `${s.isSacrifice ? "bg-amber-500" : "bg-chess-primary"} w-3 h-2`
                : "bg-chess-border hover:bg-chess-muted w-2 h-2"
            }`} />
        ))}
      </div>

      <a href={toAnalysisUrl(game.url)} target="_blank" rel="noopener noreferrer"
        className="text-[10px] text-center text-chess-muted hover:text-chess-primary underline underline-offset-2">
        Chess.com 전체 분석 →
      </a>
    </div>
  );
}

// ─── 게임 선택 행 ────────────────────────────────────────────
const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  win:  { label: "승", cls: "text-emerald-700 border-emerald-700/30 bg-emerald-700/10" },
  loss: { label: "패", cls: "text-red-700 border-red-600/30 bg-red-600/10" },
  draw: { label: "무", cls: "text-chess-muted border-chess-border bg-chess-border/20" },
};

function SacGameRow({ game, rank, isSelected, onSelect }: {
  game: PatternGameItem; rank: number; isSelected: boolean; onSelect: () => void;
}) {
  const badge = RESULT_BADGE[game.result] ?? RESULT_BADGE.draw;
  const isOk  = game.is_success === true;
  return (
    <button type="button" onClick={onSelect}
      className={`w-full text-left rounded-xl border transition-all duration-150 px-3 py-2.5
        ${isSelected
          ? "border-amber-600/60 bg-amber-600/8 shadow-sm"
          : "border-chess-border bg-chess-bg/80 hover:border-chess-muted hover:bg-chess-surface"}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-chess-muted w-4 shrink-0 text-right">#{rank}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOk ? "bg-emerald-500" : "bg-red-500"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-chess-primary font-medium truncate">{game.opening_name ?? "오프닝 정보 없음"}</p>
          <p className="text-[10px] text-chess-muted truncate">
            {game.played_at ? new Date(game.played_at).toLocaleDateString("ko-KR", { month:"short", day:"numeric" }) : "날짜 불명"}
            {game.white && game.black && <span className="ml-1 opacity-60">{game.white} vs {game.black}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className={`text-[10px] font-bold ${isOk ? "text-emerald-700" : "text-red-600"}`}>{isOk ? "유효" : "무효"}</span>
          <span className={`text-[9px] px-1 py-0.5 rounded-full border font-semibold ${badge.cls}`}>{badge.label}</span>
        </div>
        <span className={`text-[10px] shrink-0 ${isSelected ? "text-amber-500" : "text-chess-muted"}`}>{isSelected ? "▶" : "›"}</span>
      </div>
      {game.context && <p className="text-[10px] text-chess-muted italic truncate mt-0.5 pl-6">{game.context}</p>}
    </button>
  );
}

// ─── 메인 모달 ───────────────────────────────────────────────
type TabId = "all" | "success" | "fail";
interface Props { pattern: TacticalPattern | null; onClose: () => void; }

export default function SacrificePatternModal({ pattern, onClose }: Props) {
  const [tab,          setTab]          = useState<TabId>("all");
  const [selectedGame, setSelectedGame] = useState<PatternGameItem | null>(null);

  useEffect(() => {
    if (!pattern) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [onClose, pattern]);

  useEffect(() => { setTab("all"); setSelectedGame(null); }, [pattern]);

  if (!pattern) return null;

  const allGames      = pattern.top_games ?? [];
  const successInList = allGames.filter((g) => g.is_success === true).length;
  const failInList    = allGames.filter((g) => g.is_success === false).length;
  const filteredGames =
    tab === "success" ? allGames.filter((g) => g.is_success === true)
    : tab === "fail"  ? allGames.filter((g) => g.is_success === false)
    : allGames;

  // 도넛: evidence_count(전체 희생 수) + key_metric_value(성공률 %) 기반
  const totalSac     = pattern.evidence_count ?? allGames.length;
  const rateVal      = pattern.key_metric_value ?? 0;
  const successCount = Math.round(totalSac * rateVal / 100);
  const failCount    = totalSac - successCount;

  const scoreColor = pattern.score >= 65 ? "text-emerald-700" : pattern.score >= 45 ? "text-amber-700" : "text-red-700";
  const scoreBg    = pattern.score >= 65 ? "bg-emerald-600"   : pattern.score >= 45 ? "bg-amber-600"   : "bg-red-600";
  const hasBoard   = !!selectedGame;

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative flex flex-col bg-chess-surface border border-chess-border rounded-2xl shadow-2xl
                    overflow-hidden transition-[max-width] duration-300
                    ${hasBoard ? "w-full max-w-[690px]" : "w-full max-w-lg"}`}
        style={{ maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-chess-border bg-chess-bg/70 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl leading-none">{pattern.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-chess-primary">{pattern.label}</h2>
                {pattern.is_strength ? <span className="text-xs text-emerald-700 font-bold">★ 강점</span> : <span className="text-xs text-red-700 font-bold">▼ 약점</span>}
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-700/30 bg-blue-700/8 text-blue-700 font-semibold">🔬 Stockfish</span>
              </div>
              <p className="text-xs text-chess-muted mt-0.5">legal capture → material deficit → eval +1.5↑ → false adv filter</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-chess-muted hover:text-chess-primary text-xl leading-none p-1">✕</button>
        </div>

        {/* 바디 2-컬럼 */}
        <div className="flex flex-1 min-h-0">

          {/* 왼쪽: 통계 + 탭 + 게임 목록 */}
          <div className={`flex flex-col shrink-0 ${hasBoard ? "w-72 border-r border-chess-border" : "w-full"}`}>

            {/* 도넛 + 점수 */}
            <div className="px-4 py-3 border-b border-chess-border bg-chess-bg/40 shrink-0">
              <div className="flex items-center gap-4">
                <SacDonutChart successCount={successCount} failCount={failCount} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] text-chess-muted truncate">{pattern.detail}</span>
                    <span className={`text-sm font-bold shrink-0 ${scoreColor}`}>{pattern.score}점</span>
                  </div>
                  <div className="w-full bg-chess-border/60 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBg}`} style={{ width: `${pattern.score}%` }} />
                  </div>
                  <p className="text-[10px] text-chess-muted">{pattern.games_analyzed}게임 분석</p>
                  {pattern.insight && <p className="text-[10px] text-chess-muted border-l-2 border-chess-muted/30 pl-2 line-clamp-2">{pattern.insight}</p>}
                </div>
              </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className="flex border-b border-chess-border shrink-0 bg-chess-bg/30">
              {([ ["all","전체",allGames.length], ["success","유효",successInList], ["fail","무효",failInList] ] as [TabId,string,number][]).map(([id, label, cnt]) => (
                <button key={id} onClick={() => { setTab(id); setSelectedGame(null); }}
                  className={`flex-1 py-2 text-xs font-medium transition-colors relative
                    ${tab === id ? "text-chess-primary" : "text-chess-muted hover:text-chess-primary"}`}>
                  {label}
                  {cnt > 0 && (
                    <span className={`ml-1 text-[9px] font-bold px-1 rounded-full ${
                      id === "success" ? "text-emerald-700 bg-emerald-700/10"
                      : id === "fail"  ? "text-red-600 bg-red-600/10"
                      : "text-chess-muted bg-chess-border/40"}`}>{cnt}</span>
                  )}
                  {tab === id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chess-primary rounded-full" />}
                </button>
              ))}
            </div>

            {/* 게임 목록 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredGames.length === 0
                ? <p className="text-xs text-chess-muted text-center py-8">해당 탭에 게임 없음</p>
                : filteredGames.map((g, i) => (
                    <SacGameRow key={`${g.url}-${i}`} game={g} rank={i + 1}
                      isSelected={selectedGame?.url === g.url}
                      onSelect={() => setSelectedGame((prev) => prev?.url === g.url ? null : g)} />
                  ))
              }
            </div>

            {/* 푸터 */}
            <div className="px-4 py-2.5 border-t border-chess-border bg-chess-bg/50 shrink-0 flex items-center justify-between">
              <p className="text-[10px] text-chess-muted">게임 선택 → 오른쪽에 보드 펼침</p>
              <button onClick={onClose} className="text-[10px] text-chess-muted hover:text-chess-primary px-2.5 py-1 rounded-lg border border-chess-border transition-colors">닫기</button>
            </div>
          </div>

          {/* 오른쪽: 체스보드 패널 — 고정 너비, 스크롤 없음 */}
          {hasBoard && (
            <div className="w-[310px] shrink-0 p-3 bg-chess-bg/20 overflow-y-auto">
              <SacrificeBoardPanel game={selectedGame!} onClose={() => setSelectedGame(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
