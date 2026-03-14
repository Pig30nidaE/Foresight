"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

// ─── 희생 칸 하이라이트 키프레임 ─────────────────────────────
const SQ_KEYFRAMES = `
@keyframes sq-glow {
  0%,100% { box-shadow: inset 0 0 0 2px rgba(56,189,248,0.5); }
  50%     { box-shadow: inset 0 0 0 3px #38bdf8, 0 0 10px 3px rgba(56,189,248,0.35); }
}
`;

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";
import type { TacticalPattern, PatternGameItem } from "@/features/dashboard/types";

// ─── Chess.com 분석 URL (특정 수로 이동) ────────────────────
function toAnalysisUrl(url: string, moveNo?: number, color?: "white" | "black"): string {
  if (!url) return url;
  // sacrifice ply를 0-based로 계산한다.
  // Chess.com `move` 파라미터는 내부적으로 0-based ply와 매칭되는 케이스가 많아
  // 기존 +1 오프셋에서 한 수 밀리는 문제가 발생해 보정한다.
  const sacPlyZeroBased =
    moveNo !== undefined && color !== undefined
      ? color === "white" ? (moveNo - 1) * 2 : (moveNo - 1) * 2 + 1
      : undefined;
  const m = url.match(/^(https?:\/\/(?:www\.)?chess\.com)\/game\/(live|daily)\/(\w+)/);
  if (m) {
    const base = `${m[1]}/analysis/game/${m[2]}/${m[3]}/analysis`;
    return sacPlyZeroBased !== undefined ? `${base}?tab=analysis&move=${sacPlyZeroBased}` : base;
  }
  if (/lichess\.org\/[A-Za-z0-9]+/.test(url)) {
    // lichess는 anchor ply를 1-based로 취급하므로 +1 보정
    const lichessPly = sacPlyZeroBased !== undefined ? sacPlyZeroBased + 1 : undefined;
    return lichessPly !== undefined
      ? url.replace(/(\?.*)?$/, `#${lichessPly}`)
      : url.replace(/(\?.*)?$/, "#analysis");
  }
  return url;
}

// ─── PGN 파싱 → 주변 수 스텝 배열 ──────────────────────────
interface BoardStep {
  fen: string;
  label: string;
  isSacrifice: boolean;
  sacSquare?: string;   // 희생 수의 목적지 칸 (하이라이트용)
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
      steps.push({ fen: base.fen(), label, isSacrifice: isSac, sacSquare: isSac ? history[sacIdx].to : undefined, san: i < history.length ? history[i].san : undefined, arrows });
      if (i < endIdx && i < history.length) base.move(history[i]);
    }
    return steps;
  } catch {
    return null;
  }
}

// ─── 도넛 차트 ───────────────────────────────────────────────
function SacDonutChart({ counts }: { counts: { t1: number; t2: number; t3: number; t4: number; t5: number } }) {
  const t1 = Number.isFinite(counts.t1) ? counts.t1 : 0;
  const t2 = Number.isFinite(counts.t2) ? counts.t2 : 0;
  const t3 = Number.isFinite(counts.t3) ? counts.t3 : 0;
  const t4 = Number.isFinite(counts.t4) ? counts.t4 : 0;
  const t5 = Number.isFinite(counts.t5) ? counts.t5 : 0;
  const total = Math.max(t1 + t2 + t3 + t4 + t5, 0);

  const data = [
    { name: "T1", label: "유일강수", value: Math.max(t1, 0), color: "#10b981" },
    { name: "T2", label: "상위추천", value: Math.max(t2, 0), color: "#84cc16" },
    { name: "T3", label: "선택형", value: Math.max(t3, 0), color: "#f59e0b" },
    { name: "T4", label: "큰하락", value: Math.max(t4, 0), color: "#fb7185" },
    { name: "T5", label: "두면안됨", value: Math.max(t5, 0), color: "#334155" },
  ];

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
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val, name, item) => {
                const n = typeof val === "number" ? val : Number(val) || 0;
                const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                const label = (item?.payload as { label?: string } | undefined)?.label ?? "";
                return [`${n}건 (${pct}%)`, `${name} ${label}`];
              }}
              contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: 8, fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* 중앙 텍스트 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] font-bold text-chess-primary">T1~T5</span>
          <span className="text-[9px] text-chess-muted">비율</span>
          <span className="text-[9px] text-chess-muted mt-0.5">총 {total}회</span>
        </div>
      </div>
      {/* 범례 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <span key={entry.name} className="flex items-center gap-1 text-chess-muted">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: entry.color }} />
              {entry.name} {pct}%
            </span>
          );
        })}
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

  // stepIdx가 steps 범위를 벗어나지 않도록 클램핑
  const safeIdx = (steps && steps.length > 0) ? Math.min(stepIdx, steps.length - 1) : 0;

  if (!hasSacData || !steps || steps.length === 0) {
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

  const cur = steps[safeIdx];
  // sacrifice_color가 "white"면 백 플레이어 시점(하단=백), "black"이면 흑 플레이어 시점(하단=흑)
  const orientation: "white" | "black" = game.sacrifice_color === "white" ? "white" : "black";

  return (
    <div className="flex flex-col gap-3" style={{ position: "relative" }}>
      {/* 희생 칸 glow CSS 주입 */}
      <style>{SQ_KEYFRAMES}</style>

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
      <div className="w-full max-w-[260px] mx-auto" style={{ position: "relative" }}>

        {/* 상단 = 보드 위쪽 = 상대방 */}
        {/* orientation="white" → 흑(game.black)이 위 | orientation="black" → 백(game.white)이 위 */}
        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: orientation === "white" ? "#4a5568" : "#e2e8f0" }} />
            {orientation === "white" ? game.black : game.white}
          </span>
          <span className="text-chess-muted text-[10px]">{orientation === "white" ? "흑" : "백"}</span>
        </div>
        
        <Chessboard options={{
          position: cur.fen, boardOrientation: orientation, allowDragging: false,
          arrows: cur.arrows, animationDurationInMs: 400, showAnimations: true,
          boardStyle: { borderRadius: 8, width: "100%", aspectRatio: "1" },
          darkSquareStyle: { backgroundColor: "#4a5568" }, lightSquareStyle: { backgroundColor: "#e2e8f0" },
          squareStyles: cur.sacSquare
            ? { [cur.sacSquare]: { animation: "sq-glow 1.4s ease-in-out infinite" } }
            : {},
        }} />
        
        {/* 하단 = 보드 아래쪽 = 희생 플레이어(나) */}
        {/* orientation="white" → 백(game.white)이 아래 | orientation="black" → 흑(game.black)이 아래 */}
        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: orientation === "white" ? "#e2e8f0" : "#4a5568" }} />
            {orientation === "white" ? game.white : game.black}
          </span>
          <span className="text-chess-muted text-[10px]">{orientation === "white" ? "백" : "흑"}</span>
        </div>
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

      <a
        href={toAnalysisUrl(game.url, game.sacrifice_move_no ?? undefined, game.sacrifice_color as "white" | "black" | undefined)}
        target="_blank" rel="noopener noreferrer"
        className="text-[10px] text-center text-chess-muted hover:text-chess-primary underline underline-offset-2">
        Chess.com 분석 (해당 수) →
      </a>
    </div>
  );
}

// ─── 희생 등급 메타 ──────────────────────────────────────────
const SAC_TIER_META: Record<1 | 2 | 3 | 4 | 5, {
  label: string;
  short: string;
  dot: string;
  border: string;
  bg: string;
  text: string;
  desc: string;
}> = {
  1: {
    label: "T1 유일강수",
    short: "T1",
    dot: "bg-emerald-500",
    border: "border-emerald-600/35",
    bg: "bg-emerald-600/8",
    text: "text-emerald-700",
    desc: "사실상 유일하게 유리할 수 있는 희생이며 평가가 크게 상승한 수",
  },
  2: {
    label: "T2 전술상승",
    short: "T2",
    dot: "bg-lime-500",
    border: "border-lime-600/35",
    bg: "bg-lime-600/8",
    text: "text-lime-700",
    desc: "최선은 아닐 수 있지만 전술적 보상이 있고 평가가 근소하게 오른 수",
  },
  3: {
    label: "T3 선택형",
    short: "T3",
    dot: "bg-amber-500",
    border: "border-amber-600/35",
    bg: "bg-amber-600/8",
    text: "text-amber-700",
    desc: "희생을 해도 되고 안 해도 되며 평가 차이가 크지 않은 수",
  },
  4: {
    label: "T4 큰하락",
    short: "T4",
    dot: "bg-rose-400",
    border: "border-rose-600/35",
    bg: "bg-rose-600/8",
    text: "text-rose-700",
    desc: "추천수 4순위 이하에서 ca가 cb 대비 크게 떨어지는 수",
  },
  5: {
    label: "T5 두면안됨",
    short: "T5",
    dot: "bg-slate-700",
    border: "border-slate-600/45",
    bg: "bg-slate-700/10",
    text: "text-slate-700",
    desc: "ca 하락으로 유리한 국면 역전을 허용하거나 명백히 불리해지는 치명 악수",
  },
};

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
  const tier = (game.sac_tier && game.sac_tier >= 1 && game.sac_tier <= 5 ? game.sac_tier : 5) as 1 | 2 | 3 | 4 | 5;
  const tierMeta = SAC_TIER_META[tier];
  return (
    <button type="button" onClick={onSelect}
      className={`w-full text-left rounded-xl border transition-all duration-150 px-3 py-2.5
        ${isSelected
          ? `${tierMeta.border} ${tierMeta.bg} shadow-sm`
          : "border-chess-border bg-chess-bg/80 hover:border-chess-muted hover:bg-chess-surface"}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-chess-muted w-4 shrink-0 text-right">#{rank}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tierMeta.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-chess-primary font-medium truncate">{game.opening_name ?? "오프닝 정보 없음"}</p>
          <p className="text-[10px] text-chess-muted truncate">
            {game.played_at ? new Date(game.played_at).toLocaleDateString("ko-KR", { month:"short", day:"numeric" }) : "날짜 불명"}
            {game.white && game.black && <span className="ml-1 opacity-60">{game.white} vs {game.black}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className={`text-[10px] font-bold ${tierMeta.text}`}>{tierMeta.label}</span>
          <span className={`text-[9px] px-1 py-0.5 rounded-full border font-semibold ${badge.cls}`}>{badge.label}</span>
        </div>
        <span className={`text-[10px] shrink-0 ${isSelected ? "text-amber-500" : "text-chess-muted"}`}>{isSelected ? "▶" : "›"}</span>
      </div>
      {game.context && <p className="text-[10px] text-chess-muted italic truncate mt-0.5 pl-6">{game.context}</p>}
    </button>
  );
}

// ─── 메인 모달 ───────────────────────────────────────────────
interface Props { pattern: TacticalPattern | null; onClose: () => void; }

export default function SacrificePatternModal({ pattern, onClose }: Props) {
  const [selectedGame, setSelectedGame] = useState<PatternGameItem | null>(null);

  useEffect(() => {
    if (!pattern) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [onClose, pattern]);

  useEffect(() => { setSelectedGame(null); }, [pattern]);

  if (!pattern) return null;

  const allGames = pattern.top_games ?? [];
  const tierGroups = ([1, 2, 3, 4, 5] as const).map((tier) => ({
    tier,
    meta: SAC_TIER_META[tier],
    games: allGames.filter((g) => (g.sac_tier ?? 5) === tier),
  }));

  // 도넛은 백엔드 실제 집계(T1~T5)를 우선 사용한다.
  // top_games는 샘플 목록이라 이를 분모로 쓰면 0%로 왜곡될 수 있다.
  const sacChart = pattern.chart_data?.type === "sacrifice_tiers" ? pattern.chart_data : null;
  const toNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const t1 = toNum(sacChart?.t1);
  const t2 = toNum(sacChart?.t2);
  const t3 = toNum(sacChart?.t3);
  const t4 = toNum(sacChart?.t4);
  const t5 = toNum(sacChart?.t5);

  const donutCounts = sacChart
    ? { t1, t2, t3, t4, t5 }
    : {
        t1: tierGroups[0].games.length,
        t2: tierGroups[1].games.length,
        t3: tierGroups[2].games.length,
        t4: tierGroups[3].games.length,
        t5: tierGroups[4].games.length,
      };

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
                <div className="relative group">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-chess-muted/40 text-[10px] font-bold text-chess-muted cursor-help">!</span>
                  <div className="pointer-events-none absolute left-0 top-6 z-20 hidden w-72 rounded-xl border border-chess-border bg-chess-surface/95 p-3 text-[10px] text-chess-muted shadow-xl group-hover:block">
                    <p className="font-semibold text-chess-primary mb-2">희생 등급 설명</p>
                    {([1, 2, 3, 4, 5] as const).map((tier) => (
                      <div key={tier} className="flex items-start gap-2 py-1">
                        <span className={`mt-0.5 inline-block h-2 w-2 rounded-full ${SAC_TIER_META[tier].dot}`} />
                        <div>
                          <p className={`font-semibold ${SAC_TIER_META[tier].text}`}>{SAC_TIER_META[tier].label}</p>
                          <p>{SAC_TIER_META[tier].desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-chess-muted mt-0.5">legal capture → tactical validity → eval delta/rank → T1~T5 tiering</p>
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
                <SacDonutChart counts={donutCounts} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] text-chess-muted truncate">{pattern.detail}</span>
                    <span className={`text-sm font-bold shrink-0 ${scoreColor}`}>{pattern.score}점</span>
                  </div>
                  <div className="w-full bg-chess-border/60 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBg}`} style={{ width: `${pattern.score}%` }} />
                  </div>
                  <p className="text-[10px] text-chess-muted">{pattern.games_analyzed}게임 분석</p>
                  {sacChart && (
                    <p className="text-[10px] text-chess-muted">
                      거절형 {sacChart.declined ?? 0} · 대안우위형 {sacChart.unnecessary ?? 0}
                    </p>
                  )}
                  {pattern.insight && <p className="text-[10px] text-chess-muted border-l-2 border-chess-muted/30 pl-2 line-clamp-2">{pattern.insight}</p>}
                </div>
              </div>
            </div>

            {/* 게임 목록: T1~T5 섹션 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {allGames.length === 0 ? <p className="text-xs text-chess-muted text-center py-8">표시할 희생 게임 없음</p> : (
                tierGroups.map(({ tier, meta, games }) => (
                  <section key={tier} className="space-y-1.5">
                    <div className={`sticky top-0 z-10 flex items-center justify-between rounded-lg border px-2.5 py-1.5 backdrop-blur-sm ${meta.border} ${meta.bg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                        <span className={`text-[11px] font-bold ${meta.text}`}>{meta.label}</span>
                      </div>
                      <span className="text-[10px] text-chess-muted">{games.length}개</span>
                    </div>
                    {games.length === 0 ? (
                      <p className="px-2 py-2 text-[10px] text-chess-muted">해당 등급 대표게임 없음</p>
                    ) : (
                      games.map((g, i) => (
                        <SacGameRow key={`${tier}-${g.url}-${i}`} game={g} rank={i + 1}
                          isSelected={selectedGame?.url === g.url && selectedGame?.sacrifice_move_no === g.sacrifice_move_no}
                          onSelect={() => setSelectedGame((prev) => (
                            prev?.url === g.url && prev?.sacrifice_move_no === g.sacrifice_move_no ? null : g
                          ))} />
                      ))
                    )}
                  </section>
                ))
              )}
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
                <SacrificeBoardPanel key={selectedGame!.url} game={selectedGame!} onClose={() => setSelectedGame(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
