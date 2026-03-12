"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TacticalPattern, PatternGameItem } from "@/features/dashboard/types";
import SacrificePatternModal from "@/features/dashboard/components/modals/SacrificePatternModal";

// Chess.com 게임 URL → 분석 URL 변환
function toAnalysisUrl(url: string): string {
  if (!url) return url;
  const cdotcom = url.match(/^(https?:\/\/(?:www\.)?chess\.com)\/game\/(live|daily)\/(\w+)/);
  if (cdotcom) return `${cdotcom[1]}/analysis/game/${cdotcom[2]}/${cdotcom[3]}/analysis`;
  if (/lichess\.org\/[A-Za-z0-9]+(?:\?|#|$)/.test(url)) return url.replace(/(\?.*)?$/, "#analysis");
  return url;
}

// ─── 패턴별 표시 설정 ──────────────────────────────────────────
// analysisType:
//   win_rate  — 게임 결과(승/패)가 곧 패턴 성공 기준
//   quality   — 수 품질·지표가 기준, 결과는 참고
//   occurrence — 발생 횟수 기반, 단순 결과와 무관
interface PatternDisplayConfig {
  successLabel: string;
  failureLabel: string;
  drawLabel:    string;
  analysisType: "win_rate" | "quality" | "occurrence";
  analysisDesc: string; // 모달 헤더 sub-description
}

const PATTERN_CONFIG: Record<number, PatternDisplayConfig> = {
  1:  { successLabel: "핀 정확 대응",     failureLabel: "핀 기물 블런더",    drawLabel: "핀 발생",         analysisType: "quality",    analysisDesc: "핀된 기물 무리 이동 → Stockfish 블런더(≥150cp) 발생 여부" },
  3:  { successLabel: "고품질 희생(T1/T2)", failureLabel: "저품질 희생(T4)",     drawLabel: "선택형 희생(T3)", analysisType: "quality",    analysisDesc: "희생 4등급 분류: T1 유일강수·급상승 / T2 전술·소폭상승 / T3 선택형 / T4 실패, 평균 정확도로 산출" },
  4:  { successLabel: "우위 유지 성공", failureLabel: "역전 또는 마무리 실패", drawLabel: "무승부", analysisType: "quality", analysisDesc: "오프닝(5~20수) 연속 +0.75폰↑ 우위게임을 끝까지 지켰는지 분석합니다. 완벽 유지: 역전 없이 승리, 흔들렸지만 승리: 한때 역전됐지만 재역전, 역전: 우위를 놓쳐 무승부 또는 패배" },

  6:  { successLabel: "결정적 순간 포착", failureLabel: "결정적 순간 실착",   drawLabel: "무승부",          analysisType: "quality",    analysisDesc: "불리(≤-2.0) + 시간 여유(≥120초) 상황의 수 품질" },
  7:  { successLabel: "반대 방향 승리",   failureLabel: "반대 방향 패배",     drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "선택 기간 전체 게임 기준: 같은 방향 vs 반대 방향 캐슬링 승률 비교" },
  9:  { successLabel: "엔드게임 성공",    failureLabel: "엔드게임 실패",      drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "퀸 교환 후 엔드게임 전환 게임 결과" },
  10: { successLabel: "IQP 운용 우세",   failureLabel: "IQP 운용 보강",      drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "20수 시점 내 IQP/상대 IQP/무IQP 구조별 승률·수 품질 비교" },
  11: { successLabel: "비숍쌍 유지 승리", failureLabel: "비숍쌍 활용 실패",  drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "비숍 쌍 20수 이상 유지 게임 결과" },
  13: { successLabel: "블런더 없이 방어", failureLabel: "수비 중 블런더",     drawLabel: "무승부",          analysisType: "quality",    analysisDesc: "Stockfish ≤-2.0 불리 상황에서 블런더 없이 버텨낸 여부" },
  14: { successLabel: "복합 공격 대응",   failureLabel: "복합 공격 실패",     drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "3기물+ 동시 공격 상황 게임 결과" },
  15: { successLabel: "퀸 교환 유리",    failureLabel: "퀸 교환 불리",        drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "퀸 교환 타이밍 Stockfish cp 변화 기반 게임 결과" },
  16: { successLabel: "킹 안전 유지",    failureLabel: "킹 노출 실착",        drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "폰 쉴드 파괴 후 게임 결과" },
  18: { successLabel: "주력 오프닝 우세",  failureLabel: "생소 오프닝 강세",   drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "자주 플레이한 오프닝(3회+)과 생소한 오프닝의 승률 비교" },
};

// 기본 설정 (situation_id 없거나 0인 패턴 — 승/패 기반)
const DEFAULT_CONFIG: PatternDisplayConfig = {
  successLabel: "성공",
  failureLabel: "실패",
  drawLabel:    "무승부",
  analysisType: "win_rate",
  analysisDesc:  "게임 결과 기반 분석",
};

// ─── 분석 타입 배지 ─────────────────────────────────────────
const ANALYSIS_TYPE_META: Record<PatternDisplayConfig["analysisType"], { label: string; cls: string; icon: string }> = {
  win_rate:   { icon: "🏆", label: "승률 기반",    cls: "border-emerald-700/35 bg-emerald-700/8 text-emerald-700" },
  quality:    { icon: "🔬", label: "수 품질 기반", cls: "border-blue-700/30 bg-blue-700/8 text-blue-700" },
  occurrence: { icon: "📊", label: "발생 빈도 기반", cls: "border-purple-700/30 bg-purple-700/8 text-purple-700" },
};

// ─── 결과 스타일 ─────────────────────────────────────────────
const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  win:  { label: "승",   cls: "bg-emerald-700/10 text-emerald-700 border-emerald-700/30" },
  loss: { label: "패",   cls: "bg-red-600/10 text-red-700 border-red-600/30" },
  draw: { label: "무",   cls: "bg-chess-border/50 text-chess-primary border-chess-border" },
};
const RESULT_DOT: Record<string, string> = {
  win:  "bg-emerald-600",
  loss: "bg-red-600",
  draw: "bg-chess-muted",
};

const ADVANTAGE_OUTCOME_META: Record<NonNullable<PatternGameItem["advantage_outcome"]>, { label: string; cls: string }> = {
  smooth: { label: "완벽 유지", cls: "text-emerald-700" },
  shaky: { label: "흔들렸지만 승리", cls: "text-amber-700" },
  blown: { label: "역전", cls: "text-red-700" },
};

function asFiniteNumber(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseOppositeCastleDetail(detail: string): {
  oppositeGames: number;
  oppositeRate: number;
  sameGames: number;
  sameRate: number;
  delta: number;
} | null {
  const mt = detail.match(/반대\s*(\d+)게임\s*(\d+)%\s*\|\s*같은 방향\s*(\d+)게임\s*(\d+)%\s*\(([+-]?\d+)%p\)/);
  if (!mt) return null;
  return {
    oppositeGames: Number(mt[1]),
    oppositeRate: Number(mt[2]),
    sameGames: Number(mt[3]),
    sameRate: Number(mt[4]),
    delta: Number(mt[5]),
  };
}

// ─── 우위 유지력 브레이크다운 패널 (situation_id=4 전용) ──────
function AdvantageBreakdown({ data }: { data: NonNullable<TacticalPattern["chart_data"]> }) {
  const total = asFiniteNumber(data.total);
  const maintained = asFiniteNumber(data.maintained ?? data.converted);
  const reversedMid = asFiniteNumber(data.reversed_mid ?? data.shaky);
  const reversedEnd = asFiniteNumber(data.reversed_end ?? data.blown);
  const midAvgMove = asFiniteNumber(data.mid_avg_move ?? null, -1);
  const endAvgMove = asFiniteNumber(data.end_avg_move ?? null, -1);

  const maintainPct = total > 0 ? (maintained / total) * 100 : 0;
  const midPct      = total > 0 ? (reversedMid / total) * 100 : 0;
  const endPct      = total > 0 ? (reversedEnd / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-chess-border bg-chess-bg/60 p-4 space-y-3">
      <p className="text-xs font-bold text-chess-primary uppercase tracking-wide">📊 우위게임 역전 분석</p>

      {/* 스택 바 */}
      <div className="w-full flex h-3 rounded-full overflow-hidden gap-px">
        <div className="bg-emerald-600 h-full transition-all" style={{ width: `${maintainPct}%` }} title={`유지 ${maintained}건`} />
        <div className="bg-amber-600 h-full transition-all"  style={{ width: `${midPct}%` }}      title={`미들게임 역전 ${reversedMid}건`} />
        <div className="bg-red-600 h-full transition-all"    style={{ width: `${endPct}%` }}      title={`엔드게임 역전 ${reversedEnd}건`} />
      </div>

      {/* 수치 범례 */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 shrink-0" />
            <span className="text-chess-muted">우위 유지</span>
          </div>
          <span className="text-base font-black text-emerald-700 pl-4">{maintained}</span>
          <span className="text-[10px] text-chess-muted pl-4">{maintainPct.toFixed(0)}%</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 shrink-0" />
            <span className="text-chess-muted">미들게임 역전</span>
          </div>
          <span className="text-base font-black text-amber-700 pl-4">{reversedMid}</span>
          {midAvgMove >= 0 && (
            <span className="text-[10px] text-chess-muted pl-4">평균 {midAvgMove}수</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-600 shrink-0" />
            <span className="text-chess-muted">엔드게임 역전</span>
          </div>
          <span className="text-base font-black text-red-700 pl-4">{reversedEnd}</span>
          {endAvgMove >= 0 && (
            <span className="text-[10px] text-chess-muted pl-4">평균 {endAvgMove}수</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GameRow ─────────────────────────────────────────────────
interface GameRowProps {
  game:   PatternGameItem;
  rank:   number;
  config: PatternDisplayConfig;
}

function GameRow({ game, rank, config }: GameRowProps) {
  const badge  = RESULT_BADGE[game.result] ?? RESULT_BADGE.draw;
  const dot    = RESULT_DOT[game.result]   ?? RESULT_DOT.draw;

  // 패턴별 성공/실패 레이블
  let statusLabel: string;
  let statusCls: string;
  if (game.advantage_outcome && ADVANTAGE_OUTCOME_META[game.advantage_outcome]) {
    statusLabel = ADVANTAGE_OUTCOME_META[game.advantage_outcome].label;
    statusCls   = ADVANTAGE_OUTCOME_META[game.advantage_outcome].cls;
  } else if (game.result === "draw" && config.analysisType !== "quality") {
    statusLabel = config.drawLabel;
    statusCls   = "text-chess-muted";
  } else if (game.is_success === true) {
    statusLabel = config.successLabel;
    statusCls   = "text-emerald-700";
  } else if (game.is_success === false) {
    statusLabel = config.failureLabel;
    statusCls   = "text-red-700";
  } else {
    // is_success 없는 패턴 (발생 빈도 기반 등)
    statusLabel = config.drawLabel;
    statusCls   = "text-chess-muted";
  }

  const hasCtx    = !!game.context;
  const hasMetric = game.metric_value != null && game.metric_label;

  return (
    <a
      href={toAnalysisUrl(game.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl border border-chess-border bg-chess-bg/80
                 px-4 py-3 hover:border-chess-muted hover:bg-chess-surface transition-all duration-150"
    >
      {/* 순위 */}
      <span className="text-xs font-mono text-chess-muted w-5 shrink-0 text-right mt-0.5">#{rank}</span>

      {/* 결과 점 */}
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dot}`} />

      {/* 오프닝 + 날짜/플레이어 */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm text-chess-primary font-medium truncate leading-snug">
          {game.opening_name ?? "오프닝 정보 없음"}
        </p>
        <p className="text-xs text-chess-muted truncate">
          {game.played_at
            ? new Date(game.played_at).toLocaleDateString("ko-KR", {
                year: "numeric", month: "short", day: "numeric",
              })
            : "날짜 불명"}
          {game.white && game.black && (
            <span className="ml-2 opacity-70">{game.white} vs {game.black}</span>
          )}
        </p>

        {/* 컨텍스트 줄 (패턴별 per-game 설명) */}
        {hasCtx && (
          <p className="text-xs text-chess-muted italic leading-snug">{game.context}</p>
        )}
      </div>

      {/* 우측 배지 영역 */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {/* 패턴 성공/실패 레이블 */}
        <span className={`text-xs font-bold ${statusCls}`}>{statusLabel}</span>

        {/* 핵심 수치 배지 (있을 때만) */}
        {hasMetric && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md
                           border border-amber-700/30 bg-amber-700/8 text-amber-700 font-mono">
            {game.metric_value!.toFixed(
              game.metric_label?.includes("비율") || game.metric_label?.includes("CP") ? 1 : 0
            )}
            <span className="opacity-70">{game.metric_label}</span>
          </span>
        )}

        {/* 게임 결과 배지 (수 품질 분석이면 작게, 승률 분석이면 보통 크기) */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${badge.cls}
          ${config.analysisType === "win_rate" ? "text-xs" : "opacity-70"}`}>
          {badge.label}
        </span>
      </div>

      {/* 화살표 */}
      <span className="text-chess-muted group-hover:text-chess-primary transition-colors text-sm shrink-0 mt-0.5">→</span>
    </a>
  );
}

// ─── 통계 요약 바 ────────────────────────────────────────────
function StatSummary({ games, config }: { games: PatternGameItem[]; config: PatternDisplayConfig }) {
  if (!games.length) return null;
  const wins   = games.filter((g) => g.result === "win").length;
  const losses = games.filter((g) => g.result === "loss").length;
  const draws  = games.filter((g) => g.result === "draw").length;
  const successes = games.filter((g) => g.is_success === true).length;
  const failures  = games.filter((g) => g.is_success === false).length;

  // 수치 배지가 있는 게임들의 평균
  const metriced = games.filter((g) => g.metric_value != null);
  const avgMetric = metriced.length
    ? metriced.reduce((s, g) => s + g.metric_value!, 0) / metriced.length
    : null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* 승/무/패 */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-emerald-700 font-bold">{wins}승</span>
        <span className="text-chess-muted">·</span>
        <span className="text-chess-muted">{draws}무</span>
        <span className="text-chess-muted">·</span>
        <span className="text-red-700 font-bold">{losses}패</span>
      </div>
      {/* 패턴 성공/실패 (quality 타입일 때 의미 있음) */}
      {config.analysisType === "quality" && (successes + failures) > 0 && (
        <>
          <span className="text-chess-muted text-xs">|</span>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-emerald-700">✓ {successes}</span>
            <span className="text-chess-muted">/</span>
            <span className="text-red-700">✗ {failures}</span>
          </div>
        </>
      )}
      {/* 평균 지표 */}
      {avgMetric != null && metriced[0]?.metric_label && (
        <>
          <span className="text-chess-muted text-xs">|</span>
          <span className="text-xs text-amber-700 font-mono">
            avg {avgMetric.toFixed(1)} <span className="text-chess-muted">{metriced[0].metric_label}</span>
          </span>
        </>
      )}
    </div>
  );
}

// ─── CastlingGameRow (캐슬링 방향별 탭용 게임 행) ─────────────
type CastlingGameEntry = {
  url: string | null;
  result: string;
  opening_name?: string | null;
  opening_eco?: string | null;
  played_at?: string | null;
  white?: string;
  black?: string;
};

function CastlingGameRow({ game, rank }: { game: CastlingGameEntry; rank: number }) {
  const badge = RESULT_BADGE[game.result] ?? RESULT_BADGE.draw;
  const dot   = RESULT_DOT[game.result]   ?? RESULT_DOT.draw;

  if (!game.url) return null;

  return (
    <a
      href={toAnalysisUrl(game.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl border border-chess-border bg-chess-bg/80
                 px-4 py-3 hover:border-chess-muted hover:bg-chess-surface transition-all duration-150"
    >
      <span className="text-xs font-mono text-chess-muted w-5 shrink-0 text-right mt-0.5">#{rank}</span>
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dot}`} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm text-chess-primary font-medium truncate leading-snug">
          {game.opening_name ?? "오프닝 정보 없음"}
        </p>
        <p className="text-xs text-chess-muted truncate">
          {game.played_at
            ? new Date(game.played_at).toLocaleDateString("ko-KR", {
                year: "numeric", month: "short", day: "numeric",
              })
            : "날짜 불명"}
          {game.white && game.black && (
            <span className="ml-2 opacity-70">{game.white} vs {game.black}</span>
          )}
        </p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 ${badge.cls}`}>
        {badge.label}
      </span>
      <span className="text-chess-muted group-hover:text-chess-primary transition-colors text-sm shrink-0 mt-0.5">→</span>
    </a>
  );
}

// ─── 메인 모달 ───────────────────────────────────────────────
interface Props {
  pattern: TacticalPattern | null;
  onClose: () => void;
}

export default function PatternGameListModal({ pattern, onClose }: Props) {
  const isSacrifice = pattern?.situation_id === 3;
  const isOppositeCastle = pattern?.situation_id === 7;
  const isIQPStructure = pattern?.situation_id === 10;
  const isOpeningFamiliarity = pattern?.situation_id === 18;
  const isAdvantageRetention = pattern?.situation_id === 4;
  const [castlingTab, setCastlingTab] = useState<"opposite" | "same">("opposite");
  const [iqpTab, setIqpTab] = useState<"my" | "opp" | "none">("my");
  const [openingTab, setOpeningTab] = useState<"main" | "unfamiliar">("main");
  const [advantageTab, setAdvantageTab] = useState<"kept" | "blown">("kept");

  useEffect(() => {
    setCastlingTab("opposite");
    setIqpTab("my");
    setOpeningTab("main");
    setAdvantageTab("kept");
  }, [pattern]);

  // ESC 키 닫기 (희생 모달에서는 SacrificePatternModal이 자체 처리)
  useEffect(() => {
    if (!pattern || isSacrifice) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, pattern, isSacrifice]);

  if (!pattern) return null;

  // situation_id=3(희생 패턴) → 전용 모달 위임
  if (isSacrifice) {
    return <SacrificePatternModal pattern={pattern} onClose={onClose} />;
  }

  const games: PatternGameItem[] = pattern.top_games ?? [];
  const advantageKeptGames = isAdvantageRetention
    ? games.filter((g) => g.advantage_outcome === "smooth" || g.advantage_outcome === "shaky")
    : [];
  const advantageBlownGames = isAdvantageRetention
    ? games.filter((g) => g.advantage_outcome === "blown" || g.is_success === false)
    : [];
  const cfg = (pattern.situation_id && PATTERN_CONFIG[pattern.situation_id]) || DEFAULT_CONFIG;
  const typeMeta = ANALYSIS_TYPE_META[cfg.analysisType];
  const castleBreakdown = isOppositeCastle ? parseOppositeCastleDetail(pattern.detail) : null;
  const iqpBreakdown = isIQPStructure && pattern.chart_data?.type === "iqp_comparison"
    ? pattern.chart_data
    : null;
  const openingBreakdown = isOpeningFamiliarity && pattern.chart_data?.type === "opening_comparison"
    ? pattern.chart_data
    : null;

  const scoreColor = pattern.score >= 65 ? "text-emerald-700" : pattern.score >= 45 ? "text-amber-700" : "text-red-700";
  const scoreBg    = pattern.score >= 65 ? "bg-emerald-600"   : pattern.score >= 45 ? "bg-amber-600"   : "bg-red-600";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[88vh] flex flex-col
                   bg-chess-surface border border-chess-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className={`flex items-start justify-between gap-3 px-6 pt-6 pb-3 border-b border-chess-border ${
          isOppositeCastle
            ? "bg-gradient-to-r from-red-900/20 via-orange-900/15 to-blue-900/15"
            : isIQPStructure
              ? "bg-gradient-to-r from-cyan-900/20 via-teal-900/15 to-emerald-900/15"
            : isOpeningFamiliarity
              ? "bg-gradient-to-r from-emerald-900/20 via-lime-900/15 to-amber-900/15"
              : "bg-chess-bg/70"
        }`}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl leading-none">{pattern.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-chess-primary leading-snug">{pattern.label}</h2>
                {pattern.is_strength
                  ? <span className="text-xs text-emerald-700 font-bold">★ 강점</span>
                  : <span className="text-xs text-red-700 font-bold">▼ 약점</span>
                }
                {/* 분석 타입 배지 */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${typeMeta.cls}`}>
                  {typeMeta.icon} {typeMeta.label}
                </span>
              </div>
              {/* 분석 기준 설명 */}
              <p className="text-xs text-chess-muted mt-1 leading-snug">{cfg.analysisDesc}</p>
              {isAdvantageRetention && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="px-2 py-0.5 rounded-full border border-emerald-700/30 bg-emerald-700/10 text-emerald-700 font-semibold">완벽 유지: 역전 없이 승리</span>
                  <span className="px-2 py-0.5 rounded-full border border-amber-700/30 bg-amber-700/10 text-amber-700 font-semibold">흔들렸지만 승리: 한때 역전 후 재역전</span>
                  <span className="px-2 py-0.5 rounded-full border border-red-700/30 bg-red-700/10 text-red-700 font-semibold">역전: 우위를 놓쳐 무승부/패배</span>
                </div>
              )}
              {isOppositeCastle && (
                <div className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold px-2 py-1 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-200">
                  ⚔️ 캐슬링 방향 대결 지표
                </div>
              )}
              {isIQPStructure && (
                <div className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold px-2 py-1 rounded-full border border-cyan-600/30 bg-cyan-600/10 text-cyan-200">
                  ♟️ IQP 구조 운용 비교 지표
                </div>
              )}
              {isOpeningFamiliarity && (
                <div className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold px-2 py-1 rounded-full border border-emerald-600/30 bg-emerald-600/10 text-emerald-200">
                  📚 오프닝 친숙도 비교 지표
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-chess-muted hover:text-chess-primary transition-colors text-xl leading-none p-1">✕</button>
        </div>

        {/* ── 점수 + 요약 ── */}
        <div className={`px-6 py-3 border-b border-chess-border space-y-2 ${
          (isOppositeCastle || isIQPStructure || isOpeningFamiliarity) ? "bg-gradient-to-b from-chess-bg/55 to-chess-bg/30" : "bg-chess-bg/40"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-chess-muted">{pattern.detail}</span>
            <span className={`text-sm font-bold ${scoreColor}`}>{pattern.score}점</span>
          </div>
          <div className="w-full bg-chess-border/60 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full ${scoreBg} transition-all`} style={{ width: `${pattern.score}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-chess-muted">
              {pattern.situation_id === 4 && pattern.chart_data?.type === "advantage_breakdown"
                ? `탐색 ${pattern.chart_data.scan_pool ?? "?"}게임 중 조건 충족 ${pattern.games_analyzed}게임 분석`
                : `${pattern.games_analyzed}게임 분석 기반`}
            </p>
            {/* 성공/실패 범례 */}
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="w-2 h-2 rounded-sm bg-emerald-600/60 inline-block" />
                {cfg.successLabel}
              </span>
              <span className="flex items-center gap-1 text-red-700">
                <span className="w-2 h-2 rounded-sm bg-red-600/60 inline-block" />
                {cfg.failureLabel}
              </span>
            </div>
          </div>
          {isOppositeCastle && castleBreakdown && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg border border-red-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-red-700">반대 방향</p>
                <p className="text-2xl font-black text-red-800 leading-tight tabular-nums">{castleBreakdown.oppositeRate}%</p>
                <p className="text-[10px] text-red-700/80 tabular-nums">{castleBreakdown.oppositeGames}게임</p>
              </div>
              <div className="rounded-lg border border-sky-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-sky-700">같은 방향</p>
                <p className="text-2xl font-black text-sky-800 leading-tight tabular-nums">{castleBreakdown.sameRate}%</p>
                <p className="text-[10px] text-sky-700/80 tabular-nums">{castleBreakdown.sameGames}게임</p>
              </div>
              <div className="col-span-2 rounded-lg border border-amber-200 bg-white/95 px-3 py-2 shadow-sm flex items-center justify-between">
                <span className="text-[10px] text-amber-800 uppercase tracking-wide">반대-같은 방향 승률 차</span>
                <span className={`text-base font-extrabold tabular-nums ${castleBreakdown.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {castleBreakdown.delta >= 0 ? "+" : ""}{castleBreakdown.delta}%p
                </span>
              </div>
            </div>
          )}
          {isAdvantageRetention && pattern.chart_data?.type === "advantage_breakdown" && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-lg border border-emerald-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700">우위 유지 성공</p>
                <p className="text-2xl font-black text-emerald-800 leading-tight tabular-nums">{asFiniteNumber(pattern.chart_data.maintained ?? pattern.chart_data.converted)}</p>
                <p className="text-[10px] text-emerald-700/80 tabular-nums">{asFiniteNumber(pattern.chart_data.total) > 0 ? Math.round((asFiniteNumber(pattern.chart_data.maintained ?? pattern.chart_data.converted) / asFiniteNumber(pattern.chart_data.total)) * 100) : 0}%</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-amber-700">중반 역전</p>
                <p className="text-2xl font-black text-amber-800 leading-tight tabular-nums">{asFiniteNumber(pattern.chart_data.reversed_mid ?? pattern.chart_data.shaky)}</p>
                <p className="text-[10px] text-amber-700/80 tabular-nums">{pattern.chart_data.mid_avg_move != null ? `평균 ${pattern.chart_data.mid_avg_move}수` : "-"}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-red-700">엔드게임 역전</p>
                <p className="text-2xl font-black text-red-800 leading-tight tabular-nums">{asFiniteNumber(pattern.chart_data.reversed_end ?? pattern.chart_data.blown)}</p>
                <p className="text-[10px] text-red-700/80 tabular-nums">{pattern.chart_data.end_avg_move != null ? `평균 ${pattern.chart_data.end_avg_move}수` : "-"}</p>
              </div>
            </div>
          )}
          {isOpeningFamiliarity && openingBreakdown && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg border border-emerald-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700">주력 오프닝</p>
                <p className="text-2xl font-black text-emerald-800 leading-tight tabular-nums">{openingBreakdown.main_rate.toFixed(0)}%</p>
                <p className="text-[10px] text-emerald-700/80 tabular-nums">{openingBreakdown.main_count}게임</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-amber-700">생소 오프닝</p>
                <p className="text-2xl font-black text-amber-800 leading-tight tabular-nums">{openingBreakdown.unfamiliar_rate.toFixed(0)}%</p>
                <p className="text-[10px] text-amber-700/80 tabular-nums">{openingBreakdown.unfamiliar_count}게임</p>
              </div>
              <div className="col-span-2 rounded-lg border border-lime-200 bg-white/95 px-3 py-2 shadow-sm flex items-center justify-between">
                <span className="text-[10px] text-lime-800 uppercase tracking-wide">주력-생소 오프닝 승률 차</span>
                <span className={`text-base font-extrabold tabular-nums ${openingBreakdown.diff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {openingBreakdown.diff >= 0 ? "+" : ""}{openingBreakdown.diff.toFixed(0)}%p
                </span>
              </div>
            </div>
          )}
          {isIQPStructure && iqpBreakdown && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-lg border border-cyan-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-cyan-700">내 IQP</p>
                <p className="text-2xl font-black text-cyan-800 leading-tight tabular-nums">{iqpBreakdown.my_iqp_rate.toFixed(0)}%</p>
                <p className="text-[10px] text-cyan-700/80 tabular-nums">{iqpBreakdown.my_iqp_count}게임</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700">상대 IQP</p>
                <p className="text-2xl font-black text-emerald-800 leading-tight tabular-nums">{iqpBreakdown.opp_iqp_rate.toFixed(0)}%</p>
                <p className="text-[10px] text-emerald-700/80 tabular-nums">{iqpBreakdown.opp_iqp_count}게임</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide text-slate-700">무IQP</p>
                <p className="text-2xl font-black text-slate-800 leading-tight tabular-nums">{iqpBreakdown.none_iqp_rate.toFixed(0)}%</p>
                <p className="text-[10px] text-slate-700/80 tabular-nums">{iqpBreakdown.none_iqp_count}게임</p>
              </div>
              <div className="col-span-3 rounded-lg border border-sky-200 bg-white/95 px-3 py-2 shadow-sm flex items-center justify-between">
                <span className="text-[10px] text-sky-800 uppercase tracking-wide">내 IQP - 무IQP 승률 차</span>
                <span className={`text-base font-extrabold tabular-nums ${iqpBreakdown.my_vs_none_diff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {iqpBreakdown.my_vs_none_diff >= 0 ? "+" : ""}{iqpBreakdown.my_vs_none_diff.toFixed(0)}%p
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── 게임 목록 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isOppositeCastle && pattern.chart_data?.type === "castling_comparison" ? (
            <>
              {/* 방향별 탭 네비게이션 */}
              <div className="flex border-b border-chess-border -mx-6 px-6 pb-0 mb-3">
                {([
                  ["opposite", "⚔️ 반대 방향", pattern.chart_data.opposite_games.length],
                  ["same",     "🤝 같은 방향",  pattern.chart_data.same_games.length],
                ] as ["opposite" | "same", string, number][]).map(([id, label, cnt]) => (
                  <button
                    key={id}
                    onClick={() => setCastlingTab(id)}
                    className={`flex-1 pb-2 text-sm font-semibold transition-colors relative ${
                      castlingTab === id ? "text-chess-primary" : "text-chess-muted hover:text-chess-primary"
                    }`}
                  >
                    {label}
                    <span className="ml-1 text-[10px] font-normal opacity-70">({cnt})</span>
                    {castlingTab === id && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chess-primary rounded-full" />
                    )}
                  </button>
                ))}
              </div>
              {/* 선택된 탭 게임 목록 */}
              {(castlingTab === "opposite"
                ? pattern.chart_data.opposite_games
                : pattern.chart_data.same_games
              ).filter((g) => !!g.url).length === 0 ? (
                <p className="text-sm text-chess-muted text-center py-8">
                  {castlingTab === "opposite" ? "반대 방향 캐슬링 게임이 없습니다." : "같은 방향 캐슬링 게임이 없습니다."}
                </p>
              ) : (
                (castlingTab === "opposite"
                  ? pattern.chart_data.opposite_games
                  : pattern.chart_data.same_games
                ).filter((g) => !!g.url).map((g, i) => (
                  <CastlingGameRow key={`${g.url}-${i}`} game={g} rank={i + 1} />
                ))
              )}
            </>
          ) : isOpeningFamiliarity && pattern.chart_data?.type === "opening_comparison" ? (
            <>
              {/* 오프닝 친숙도 탭 네비게이션 */}
              <div className="flex border-b border-chess-border -mx-6 px-6 pb-0 mb-3">
                {([
                  ["main", "📘 주력 오프닝", pattern.chart_data.main_games.length],
                  ["unfamiliar", "🧪 생소 오프닝", pattern.chart_data.unfamiliar_games.length],
                ] as ["main" | "unfamiliar", string, number][]).map(([id, label, cnt]) => (
                  <button
                    key={id}
                    onClick={() => setOpeningTab(id)}
                    className={`flex-1 pb-2 text-sm font-semibold transition-colors relative ${
                      openingTab === id ? "text-chess-primary" : "text-chess-muted hover:text-chess-primary"
                    }`}
                  >
                    {label}
                    <span className="ml-1 text-[10px] font-normal opacity-70">({cnt})</span>
                    {openingTab === id && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chess-primary rounded-full" />
                    )}
                  </button>
                ))}
              </div>
              {/* 선택된 탭 게임 목록 */}
              {(openingTab === "main"
                ? pattern.chart_data.main_games
                : pattern.chart_data.unfamiliar_games
              ).filter((g) => !!g.url).length === 0 ? (
                <p className="text-sm text-chess-muted text-center py-8">
                  {openingTab === "main" ? "주력 오프닝 게임이 없습니다." : "생소 오프닝 게임이 없습니다."}
                </p>
              ) : (
                (openingTab === "main"
                  ? pattern.chart_data.main_games
                  : pattern.chart_data.unfamiliar_games
                ).filter((g) => !!g.url).map((g, i) => (
                  <CastlingGameRow key={`${g.url}-${i}`} game={g} rank={i + 1} />
                ))
              )}
            </>
          ) : isIQPStructure && pattern.chart_data?.type === "iqp_comparison" ? (
            <>
              {/* IQP 구조 탭 네비게이션 */}
              <div className="flex border-b border-chess-border -mx-6 px-6 pb-0 mb-3">
                {([
                  ["my", "♟️ 내 IQP", pattern.chart_data.my_iqp_games.length],
                  ["opp", "🎯 상대 IQP", pattern.chart_data.opp_iqp_games.length],
                  ["none", "▫️ 무IQP", pattern.chart_data.none_iqp_games.length],
                ] as ["my" | "opp" | "none", string, number][]).map(([id, label, cnt]) => (
                  <button
                    key={id}
                    onClick={() => setIqpTab(id)}
                    className={`flex-1 pb-2 text-sm font-semibold transition-colors relative ${
                      iqpTab === id ? "text-chess-primary" : "text-chess-muted hover:text-chess-primary"
                    }`}
                  >
                    {label}
                    <span className="ml-1 text-[10px] font-normal opacity-70">({cnt})</span>
                    {iqpTab === id && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chess-primary rounded-full" />
                    )}
                  </button>
                ))}
              </div>
              {(iqpTab === "my"
                ? pattern.chart_data.my_iqp_games
                : iqpTab === "opp"
                  ? pattern.chart_data.opp_iqp_games
                  : pattern.chart_data.none_iqp_games
              ).filter((g) => !!g.url).length === 0 ? (
                <p className="text-sm text-chess-muted text-center py-8">선택한 IQP 구간의 게임이 없습니다.</p>
              ) : (
                (iqpTab === "my"
                  ? pattern.chart_data.my_iqp_games
                  : iqpTab === "opp"
                    ? pattern.chart_data.opp_iqp_games
                    : pattern.chart_data.none_iqp_games
                ).filter((g) => !!g.url).map((g, i) => (
                  <CastlingGameRow key={`${g.url}-${i}`} game={g} rank={i + 1} />
                ))
              )}
            </>
          ) : (
            <>
              {/* 우위 유지력 전용 브레이크다운 패널 */}
              {pattern.chart_data?.type === "advantage_breakdown" && (
                <div className="pb-2">
                  <AdvantageBreakdown data={pattern.chart_data} />
                </div>
              )}
              {games.length === 0 ? (
                <p className="text-sm text-chess-muted text-center py-8">URL 있는 대표 게임이 없습니다.</p>
              ) : (
                <>
                  {/* 통계 요약 */}
                  <div className="pb-2">
                    <StatSummary games={games} config={cfg} />
                  </div>
                  {isAdvantageRetention ? (
                    <div className="space-y-3">
                      <div className="flex border-b border-chess-border -mx-6 px-6 pb-0 mb-1">
                        {([
                          ["kept", "✅ 우위 유지 성공", advantageKeptGames.length],
                          ["blown", "⚠️ 역전·실패", advantageBlownGames.length],
                        ] as ["kept" | "blown", string, number][]).map(([id, label, cnt]) => (
                          <button
                            key={id}
                            onClick={() => setAdvantageTab(id)}
                            className={`flex-1 pb-2 text-sm font-semibold transition-colors relative ${
                              advantageTab === id ? "text-chess-primary" : "text-chess-muted hover:text-chess-primary"
                            }`}
                          >
                            {label}
                            <span className="ml-1 text-[10px] font-normal opacity-70">({cnt})</span>
                            {advantageTab === id && (
                              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chess-primary rounded-full" />
                            )}
                          </button>
                        ))}
                      </div>

                      {advantageTab === "kept" ? (
                        advantageKeptGames.length === 0 ? (
                          <p className="text-sm text-chess-muted text-center py-6">우위를 끝까지 지킨 대표 게임이 없습니다.</p>
                        ) : (
                          advantageKeptGames.map((g, i) => (
                            <GameRow key={`${g.url}-kept-${i}`} game={g} rank={i + 1} config={cfg} />
                          ))
                        )
                      ) : (
                        advantageBlownGames.length === 0 ? (
                          <p className="text-sm text-chess-muted text-center py-6">역전된 대표 게임이 없습니다.</p>
                        ) : (
                          advantageBlownGames.map((g, i) => (
                            <GameRow key={`${g.url}-blown-${i}`} game={g} rank={i + 1} config={cfg} />
                          ))
                        )
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-chess-muted uppercase tracking-wider">
                        관련도 높은 대표 게임 ({games.length}개)
                      </p>
                      {games.map((g, i) => (
                        <GameRow key={`${g.url}-${i}`} game={g} rank={i + 1} config={cfg} />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* ── 푸터 ── */}
        <div className="px-6 py-3 border-t border-chess-border bg-chess-bg/50 flex items-center justify-between">
          <p className="text-xs text-chess-muted">클릭 → 분석 보드에서 게임 리뷰</p>
          <button
            onClick={onClose}
            className="text-xs text-chess-muted hover:text-chess-primary transition-colors px-3 py-1.5 rounded-lg border border-chess-border hover:border-chess-muted"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

