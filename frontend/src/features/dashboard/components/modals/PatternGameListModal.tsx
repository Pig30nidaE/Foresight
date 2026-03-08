"use client";

import { useEffect } from "react";
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
  3:  { successLabel: "효과적 희생",      failureLabel: "무효 희생",          drawLabel: "희생 발생",       analysisType: "quality",    analysisDesc: "기물 희생 후 후속 공격 Stockfish 기준 유효성 (avg CP손실 <80)" },
  4:  { successLabel: "전환 성공(Smooth/Shaky)", failureLabel: "전환 실패(Blown)", drawLabel: "무승부", analysisType: "quality", analysisDesc: "오프닝(5~20수) 연속 +0.75폰↑ 우위게임에서 승리로 전환(Smooth: 음수 없이 / Shaky: 음수 진입 후 만회) 비율" },

  6:  { successLabel: "결정적 순간 포착", failureLabel: "결정적 순간 실착",   drawLabel: "무승부",          analysisType: "quality",    analysisDesc: "불리(≤-2.0) + 시간 여유(≥120초) 상황의 수 품질" },
  7:  { successLabel: "반대 캐슬 공략",   failureLabel: "반대 캐슬 패배",     drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "서로 반대쪽 캐슬링 → 폰 스톰 난전 결과" },
  9:  { successLabel: "엔드게임 성공",    failureLabel: "엔드게임 실패",      drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "퀸 교환 후 엔드게임 전환 게임 결과" },
  10: { successLabel: "IQP 우위 활용",   failureLabel: "IQP 처리 미흡",      drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "고립 퀸 폰(IQP) 구조(20수 시점) 게임 결과" },
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

// ─── 우위 유지력 브레이크다운 패널 (situation_id=4 전용) ──────
function AdvantageBreakdown({ data }: { data: NonNullable<TacticalPattern["chart_data"]> }) {
  const total = data.total;
  const maintainPct = total > 0 ? (data.maintained / total) * 100 : 0;
  const midPct      = total > 0 ? (data.reversed_mid / total) * 100 : 0;
  const endPct      = total > 0 ? (data.reversed_end / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-chess-border bg-chess-bg/60 p-4 space-y-3">
      <p className="text-xs font-bold text-chess-primary uppercase tracking-wide">📊 우위게임 역전 분석</p>

      {/* 스택 바 */}
      <div className="w-full flex h-3 rounded-full overflow-hidden gap-px">
        <div className="bg-emerald-600 h-full transition-all" style={{ width: `${maintainPct}%` }} title={`유지 ${data.maintained}건`} />
        <div className="bg-amber-600 h-full transition-all"  style={{ width: `${midPct}%` }}      title={`미들게임 역전 ${data.reversed_mid}건`} />
        <div className="bg-red-600 h-full transition-all"    style={{ width: `${endPct}%` }}      title={`엔드게임 역전 ${data.reversed_end}건`} />
      </div>

      {/* 수치 범례 */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 shrink-0" />
            <span className="text-chess-muted">우위 유지</span>
          </div>
          <span className="text-base font-black text-emerald-700 pl-4">{data.maintained}</span>
          <span className="text-[10px] text-chess-muted pl-4">{maintainPct.toFixed(0)}%</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 shrink-0" />
            <span className="text-chess-muted">미들게임 역전</span>
          </div>
          <span className="text-base font-black text-amber-700 pl-4">{data.reversed_mid}</span>
          {data.mid_avg_move != null && (
            <span className="text-[10px] text-chess-muted pl-4">평균 {data.mid_avg_move}수</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-600 shrink-0" />
            <span className="text-chess-muted">엔드게임 역전</span>
          </div>
          <span className="text-base font-black text-red-700 pl-4">{data.reversed_end}</span>
          {data.end_avg_move != null && (
            <span className="text-[10px] text-chess-muted pl-4">평균 {data.end_avg_move}수</span>
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
  if (game.result === "draw" && config.analysisType !== "quality") {
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

// ─── 메인 모달 ───────────────────────────────────────────────
interface Props {
  pattern: TacticalPattern | null;
  onClose: () => void;
  username?: string | null;
}

export default function PatternGameListModal({ pattern, onClose, username }: Props) {
  const isSacrifice = pattern?.situation_id === 3;

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
  const cfg = (pattern.situation_id && PATTERN_CONFIG[pattern.situation_id]) || DEFAULT_CONFIG;
  const typeMeta = ANALYSIS_TYPE_META[cfg.analysisType];

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
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3 border-b border-chess-border bg-chess-bg/70">
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
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-chess-muted hover:text-chess-primary transition-colors text-xl leading-none p-1">✕</button>
        </div>

        {/* ── 점수 + 요약 ── */}
        <div className="px-6 py-3 border-b border-chess-border space-y-2 bg-chess-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-xs text-chess-muted">{pattern.detail}</span>
            <span className={`text-sm font-bold ${scoreColor}`}>{pattern.score}점</span>
          </div>
          <div className="w-full bg-chess-border/60 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full ${scoreBg} transition-all`} style={{ width: `${pattern.score}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-chess-muted">{pattern.games_analyzed}게임 분석 기반</p>
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
        </div>

        {/* ── 게임 목록 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
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
              <p className="text-xs text-chess-muted uppercase tracking-wider">
                관련도 높은 대표 게임 ({games.length}개)
              </p>
              {games.map((g, i) => (
                <GameRow key={`${g.url}-${i}`} game={g} rank={i + 1} config={cfg} />
              ))}
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

