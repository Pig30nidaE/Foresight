"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { TacticalPattern, PatternGameItem } from "@/features/dashboard/types";

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
  2:  { successLabel: "포크 방어 성공",   failureLabel: "포크 허용",          drawLabel: "포크 발생",       analysisType: "quality",    analysisDesc: "상대 나이트 킹+퀸 동시 공격 위협 대응 결과" },
  3:  { successLabel: "효과적 희생",      failureLabel: "무효 희생",          drawLabel: "희생 발생",       analysisType: "quality",    analysisDesc: "기물 희생 후 후속 공격 Stockfish 기준 유효성 (avg CP손실 <80)" },
  4:  { successLabel: "시간 압박 극복",   failureLabel: "시간 압박 실책",     drawLabel: "시간 압박 발생",  analysisType: "quality",    analysisDesc: "잔여시간 60초 미만 상황 → 게임 결과 (최저 잔여시간 표시)" },
  5:  { successLabel: "분위기 전환 성공", failureLabel: "연패 지속",          drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "패배 직후 다음 게임 결과 — 심리적 회복력 측정" },
  6:  { successLabel: "결정적 순간 포착", failureLabel: "결정적 순간 실착",   drawLabel: "무승부",          analysisType: "quality",    analysisDesc: "불리(≤-2.0) + 시간 여유(≥120초) 상황의 수 품질" },
  7:  { successLabel: "반대 캐슬 공략",   failureLabel: "반대 캐슬 패배",     drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "서로 반대쪽 캐슬링 → 폰 스톰 난전 결과" },
  8:  { successLabel: "이탈 대응 성공",   failureLabel: "이탈 후 블런더",     drawLabel: "무승부",          analysisType: "quality",    analysisDesc: "11~16수 이론 이탈 직후 → Stockfish 블런더 유무" },
  9:  { successLabel: "엔드게임 성공",    failureLabel: "엔드게임 실패",      drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "퀸 교환 후 엔드게임 전환 게임 결과" },
  10: { successLabel: "IQP 우위 활용",   failureLabel: "IQP 처리 미흡",      drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "고립 퀸 폰(IQP) 구조(20수 시점) 게임 결과" },
  11: { successLabel: "비숍쌍 유지 승리", failureLabel: "비숍쌍 활용 실패",  drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "비숍 쌍 20수 이상 유지 게임 결과" },
  12: { successLabel: "발견 공격 활용",   failureLabel: "발견 공격 미활용",   drawLabel: "기회 발생",       analysisType: "occurrence", analysisDesc: "슬라이더 공격선 개방 기회 발생 여부 — 횟수 중심 분석" },
  13: { successLabel: "블런더 없이 방어", failureLabel: "수비 중 블런더",     drawLabel: "무승부",          analysisType: "quality",    analysisDesc: "Stockfish ≤-2.0 불리 상황에서 블런더 없이 버텨낸 여부" },
  14: { successLabel: "복합 공격 대응",   failureLabel: "복합 공격 실패",     drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "3기물+ 동시 공격 상황 게임 결과" },
  15: { successLabel: "퀸 교환 유리",    failureLabel: "퀸 교환 불리",        drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "퀸 교환 타이밍 Stockfish cp 변화 기반 게임 결과" },
  16: { successLabel: "킹 안전 유지",    failureLabel: "킹 노출 실착",        drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "폰 쉴드 파괴 후 게임 결과" },
  17: { successLabel: "공간 우위 활용",   failureLabel: "공간 우위 낭비",     drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "폰 수 우위(공간 우위) 구조 게임 결과" },
  18: { successLabel: "레이팅 차 극복",   failureLabel: "레이팅 차 반영",     drawLabel: "무승부",          analysisType: "win_rate",   analysisDesc: "상대 레이팅 구간별 게임 결과" },
  19: { successLabel: "직관 수 정확",    failureLabel: "직관 수 실착",        drawLabel: "무승부",          analysisType: "quality",    analysisDesc: "3초 이내 즉각 응수 게임 (직관 수 비율 ≥30%) 결과 및 품질" },
  20: { successLabel: "블런더 응징 성공", failureLabel: "응징 기회 미활용",   drawLabel: "기회 발생",       analysisType: "occurrence", analysisDesc: "상대 블런더(≥150cp) 직후 응징 수(≤50cp 손실) 성공 여부" },
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
  win_rate:   { icon: "🏆", label: "승률 기반",    cls: "border-emerald-700/50 bg-emerald-950/30 text-emerald-300" },
  quality:    { icon: "🔬", label: "수 품질 기반", cls: "border-blue-700/50 bg-blue-950/30 text-blue-300" },
  occurrence: { icon: "📊", label: "발생 빈도 기반", cls: "border-purple-700/50 bg-purple-950/30 text-purple-300" },
};

// ─── 결과 스타일 ─────────────────────────────────────────────
const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  win:  { label: "승",   cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  loss: { label: "패",   cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  draw: { label: "무",   cls: "bg-zinc-500/20 text-zinc-300 border-zinc-600/30" },
};
const RESULT_DOT: Record<string, string> = {
  win:  "bg-emerald-400",
  loss: "bg-red-400",
  draw: "bg-zinc-400",
};

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
    statusCls   = "text-zinc-400";
  } else if (game.is_success === true) {
    statusLabel = config.successLabel;
    statusCls   = "text-emerald-400";
  } else if (game.is_success === false) {
    statusLabel = config.failureLabel;
    statusCls   = "text-red-400";
  } else {
    // is_success 없는 패턴 (발생 빈도 기반 등)
    statusLabel = config.drawLabel;
    statusCls   = "text-zinc-500";
  }

  const hasCtx    = !!game.context;
  const hasMetric = game.metric_value != null && game.metric_label;

  return (
    <a
      href={toAnalysisUrl(game.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60
                 px-4 py-3 hover:border-zinc-600 hover:bg-zinc-800/60 transition-all duration-150"
    >
      {/* 순위 */}
      <span className="text-xs font-mono text-zinc-600 w-5 shrink-0 text-right mt-0.5">#{rank}</span>

      {/* 결과 점 */}
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dot}`} />

      {/* 오프닝 + 날짜/플레이어 */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm text-zinc-200 font-medium truncate leading-snug">
          {game.opening_name ?? "오프닝 정보 없음"}
        </p>
        <p className="text-xs text-zinc-500 truncate">
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
          <p className="text-xs text-zinc-400 italic leading-snug">{game.context}</p>
        )}
      </div>

      {/* 우측 배지 영역 */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {/* 패턴 성공/실패 레이블 */}
        <span className={`text-xs font-bold ${statusCls}`}>{statusLabel}</span>

        {/* 핵심 수치 배지 (있을 때만) */}
        {hasMetric && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md
                           border border-amber-700/40 bg-amber-950/30 text-amber-300 font-mono">
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
      <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors text-sm shrink-0 mt-0.5">→</span>
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
        <span className="text-emerald-400 font-bold">{wins}승</span>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-400">{draws}무</span>
        <span className="text-zinc-600">·</span>
        <span className="text-red-400 font-bold">{losses}패</span>
      </div>
      {/* 패턴 성공/실패 (quality 타입일 때 의미 있음) */}
      {config.analysisType === "quality" && (successes + failures) > 0 && (
        <>
          <span className="text-zinc-700 text-xs">|</span>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-emerald-400">✓ {successes}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-red-400">✗ {failures}</span>
          </div>
        </>
      )}
      {/* 평균 지표 */}
      {avgMetric != null && metriced[0]?.metric_label && (
        <>
          <span className="text-zinc-700 text-xs">|</span>
          <span className="text-xs text-amber-300 font-mono">
            avg {avgMetric.toFixed(1)} <span className="text-zinc-500">{metriced[0].metric_label}</span>
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
}

export default function PatternGameListModal({ pattern, onClose }: Props) {
  // ESC 키 닫기
  useEffect(() => {
    if (!pattern) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, pattern]);

  if (!pattern) return null;

  const games: PatternGameItem[] = pattern.top_games ?? [];
  const cfg = (pattern.situation_id && PATTERN_CONFIG[pattern.situation_id]) || DEFAULT_CONFIG;
  const typeMeta = ANALYSIS_TYPE_META[cfg.analysisType];

  const scoreColor = pattern.score >= 65 ? "text-emerald-400" : pattern.score >= 45 ? "text-amber-400" : "text-red-400";
  const scoreBg    = pattern.score >= 65 ? "bg-emerald-500"   : pattern.score >= 45 ? "bg-amber-500"   : "bg-red-500";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[88vh] flex flex-col
                   bg-zinc-950 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3 border-b border-zinc-800">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl leading-none">{pattern.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-zinc-100 leading-snug">{pattern.label}</h2>
                {pattern.is_strength
                  ? <span className="text-xs text-emerald-400 font-bold">★ 강점</span>
                  : <span className="text-xs text-red-400 font-bold">▼ 약점</span>
                }
                {/* 분석 타입 배지 */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${typeMeta.cls}`}>
                  {typeMeta.icon} {typeMeta.label}
                </span>
              </div>
              {/* 분석 기준 설명 */}
              <p className="text-xs text-zinc-500 mt-1 leading-snug">{cfg.analysisDesc}</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors text-xl leading-none p-1">✕</button>
        </div>

        {/* ── 점수 + 요약 ── */}
        <div className="px-6 py-3 border-b border-zinc-800/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{pattern.detail}</span>
            <span className={`text-sm font-bold ${scoreColor}`}>{pattern.score}점</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full ${scoreBg} transition-all`} style={{ width: `${pattern.score}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-600">{pattern.games_analyzed}게임 분석 기반</p>
            {/* 성공/실패 범례 */}
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-sm bg-emerald-500/60 inline-block" />
                {cfg.successLabel}
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <span className="w-2 h-2 rounded-sm bg-red-500/60 inline-block" />
                {cfg.failureLabel}
              </span>
            </div>
          </div>
        </div>

        {/* ── 게임 목록 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {games.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">URL 있는 대표 게임이 없습니다.</p>
          ) : (
            <>
              {/* 통계 요약 */}
              <div className="pb-2">
                <StatSummary games={games} config={cfg} />
              </div>
              <p className="text-xs text-zinc-600 uppercase tracking-wider">
                관련도 높은 대표 게임 ({games.length}개)
              </p>
              {games.map((g, i) => (
                <GameRow key={`${g.url}-${i}`} game={g} rank={i + 1} config={cfg} />
              ))}
            </>
          )}
        </div>

        {/* ── 푸터 ── */}
        <div className="px-6 py-3 border-t border-zinc-800/60 flex items-center justify-between">
          <p className="text-xs text-zinc-600">클릭 → 분석 보드에서 게임 리뷰</p>
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-600"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

