"use client";

import { useState } from "react";
import type { TacticalAnalysis, TacticalPattern, ClusterInfo, XGBoostProfile, AiInsights } from "@/types";
import PatternGameListModal from "@/features/dashboard/components/modals/PatternGameListModal";
import { useTranslation } from "@/shared/lib/i18n";
import type { PixelGlyphComponent } from "@/shared/components/ui/PixelGlyphs";
import {
  PixelBookGlyph,
  PixelCaretDownGlyph,
  PixelCaretUpGlyph,
  PixelChartGlyph,
  PixelCheckGlyph,
  PixelClockGlyph,
  PixelDiamondGlyph,
  PixelFlagGlyph,
  PixelFolderGlyph,
  PixelPawnGlyph,
  PixelRobotGlyph,
  PixelTargetGlyph,
  PixelWarnGlyph,
  PixelStarGlyph,
} from "@/shared/components/ui/PixelGlyphs";

// Chess.com 게임 URL → 분석 URL 변환
function toAnalysisUrl(url: string): string {
  if (!url) return url;
  const cdotcom = url.match(/^(https?:\/\/(?:www\.)?chess\.com)\/game\/(live|daily)\/(\w+)/);
  if (cdotcom) return `${cdotcom[1]}/analysis/game/${cdotcom[2]}/${cdotcom[3]}/analysis`;
  if (/lichess\.org\/[A-Za-z0-9]+(?:\?|#|$)/.test(url)) return url.replace(/(\?.*)?$/, "#analysis");
  return url;
}

interface Props {
  data?: TacticalAnalysis;
  isLoading?: boolean;
}

function safeNumber(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safePercent(value: number | null | undefined): number {
  const n = safeNumber(value);
  return Math.min(100, Math.max(0, n));
}

// ─── 탭 설정 ────────────────────────────────────────────────
const TABS: { id: "all" | "time" | "position" | "opening" | "endgame"; Icon: PixelGlyphComponent }[] = [
  { id: "all",      Icon: PixelFolderGlyph },
  { id: "time",     Icon: PixelClockGlyph },
  { id: "position", Icon: PixelPawnGlyph },
  { id: "opening",  Icon: PixelBookGlyph },
  { id: "endgame",  Icon: PixelFlagGlyph },
];

const CATEGORY_COLOR: Record<string, string> = {
  time:     "text-amber-700",
  position: "text-blue-700",
  opening:  "text-chess-win",
  endgame:  "text-purple-700",
  balance:  "text-chess-primary",
};
const CATEGORY_BG: Record<string, string> = {
  time:     "bg-amber-700/8 border-amber-700/25",
  position: "bg-blue-700/8 border-blue-700/25",
  opening:  "bg-emerald-700/8 border-emerald-700/25",
  endgame:  "bg-purple-700/8 border-purple-700/25",
  balance:  "bg-chess-border/40 border-chess-border",
};

// ─── AI 코치 인사이트 섹션 ──────────────────────────────────
function AiInsightsSection({ insights, isLoading }: { insights?: AiInsights | null; isLoading?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-indigo-700/25 bg-indigo-700/6 p-5 space-y-3 animate-pulse">
        <div className="h-4 bg-indigo-700/20 rounded w-1/3" />
        <div className="h-3 bg-chess-border rounded w-full" />
        <div className="h-3 bg-chess-border rounded w-5/6" />
      </div>
    );
  }
  if (!insights) return null;
  const isGPT = insights.generated_by === "gpt-4o-mini";
  return (
    <div className="rounded-2xl border border-indigo-700/30 bg-gradient-to-br from-indigo-700/5 to-chess-bg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-indigo-700/6 transition-colors">
        <div className="flex items-center gap-2.5">
          <PixelRobotGlyph className="text-indigo-600 dark:text-indigo-400" size={18} />
          <div className="text-left">
            <p className="text-sm font-bold text-indigo-700 leading-none">{t("pattern.aiCoach")}</p>
            <p className="text-xs text-indigo-600 mt-0.5">{isGPT ? t("pattern.gptInsight") : t("pattern.ruleInsight")}</p>
          </div>
        </div>
        <span className="text-chess-muted text-sm inline-flex items-center">
          {open ? <PixelCaretUpGlyph size={14} /> : <PixelCaretDownGlyph size={14} />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-700/8 border border-emerald-700/30 p-3">
              <p className="text-xs font-bold text-chess-win mb-1">{t("pattern.bestSituation")}</p>
              <p className="text-xs text-chess-win leading-snug">{insights.best_situation}</p>
            </div>
            <div className="rounded-xl bg-red-600/8 border border-red-600/28 p-3">
              <p className="text-xs font-bold text-chess-loss mb-1">{t("pattern.worstSituation")}</p>
              <p className="text-xs text-chess-loss leading-snug">{insights.worst_situation}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-xl border border-chess-border bg-chess-bg/80 p-3.5">
              <p className="text-xs font-semibold text-chess-muted uppercase tracking-wide mb-1">{t("pattern.strengthAnalysis")}</p>
              <p className="text-sm text-chess-primary leading-relaxed">{insights.strengths_summary}</p>
            </div>
            <div className="rounded-xl border border-chess-border bg-chess-bg/80 p-3.5">
              <p className="text-xs font-semibold text-chess-muted uppercase tracking-wide mb-1">{t("pattern.weaknessAnalysis")}</p>
              <p className="text-sm text-chess-primary leading-relaxed">{insights.weaknesses_summary}</p>
            </div>
          </div>
          <div className="rounded-xl border border-amber-700/28 bg-amber-700/8 p-3.5 space-y-2">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">{t("pattern.recTraining")}</p>
            <ul className="space-y-1.5">
              {insights.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-800 leading-snug">
                  <span className="text-amber-700 shrink-0 mt-0.5">{i + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-indigo-700/28 bg-indigo-700/6 px-4 py-3 flex items-start gap-2.5">
            <PixelTargetGlyph className="text-indigo-700 shrink-0 mt-0.5" size={16} />
            <p className="text-sm text-indigo-800 leading-snug">
              <span className="font-semibold text-indigo-700">{t("pattern.focusNow")}</span>
              {insights.training_focus}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── XGBoost 블런더 위험 분석 (체스 애호가 친화 재설계) ──────
function XGBoostProfileSection({ profile }: { profile: XGBoostProfile }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const risk       = safeNumber(profile.blunder_game_rate);
  const meaningful = profile.is_meaningful ?? false;
  const games      = profile.games_analyzed;
  const lift       = Number.isFinite(profile.lift_over_baseline ?? NaN)
    ? (profile.lift_over_baseline as number)
    : null;

  // ── 위험 수준 레이블 ────────────────────────────────────────
  const riskLevel =
    risk >= 35
      ? { label: t("pattern.high"),  Icon: PixelWarnGlyph, iconClass: "text-chess-loss",     color: "text-chess-loss",     bg: "bg-red-600/10 border-red-600/30",         bar: "bg-red-600"     }
      : risk >= 20
      ? { label: t("pattern.warning"),  Icon: PixelDiamondGlyph, iconClass: "", color: "text-amber-700",   bg: "bg-amber-600/10 border-amber-600/30",     bar: "bg-amber-600"   }
      :   { label: t("pattern.good"), Icon: PixelCheckGlyph, iconClass: "", color: "text-chess-win", bg: "bg-emerald-700/10 border-emerald-700/30", bar: "bg-emerald-600" };

  // ── 예측 신뢰도 문구 합성 ───────────────────────────────────
  const confidence: { label: string; detail: string; color: string } =
    meaningful && lift !== null && lift >= 5
      ? { label: t("pattern.highConfidence"),  detail: t("pattern.confDetail1").replace("{n}", String(games)).replace("{m}", String(lift.toFixed(1))),  color: "text-chess-win" }
      : meaningful
      ? { label: t("pattern.midConfidence"),  detail: t("pattern.confDetail2").replace("{n}", String(games)),                  color: "text-amber-700"   }
      : games >= 40
      ? { label: t("pattern.refLevel"),    detail: t("pattern.confDetail3"),                    color: "text-amber-700"   }
      : { label: t("pattern.earlyLevel"),    detail: t("pattern.confDetail4"),                            color: "text-chess-muted" };

  // ── 주요 위험 요인 (설명 있는 첫 번째 항목 우선) ────────────
  const topFactor =
    profile.top_risk_factors.find((f) => !!f.description) ??
    profile.top_risk_factors[0] ??
    null;

  // ── 기술 지표 존재 여부 ─────────────────────────────────────
  const hasTechMetrics =
    Number.isFinite(profile.precision ?? NaN) &&
    Number.isFinite(profile.recall   ?? NaN) &&
    Number.isFinite(profile.f1       ?? NaN);

  const RiskIcon = riskLevel.Icon;
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-chess-muted uppercase tracking-wider font-bold">{t("pattern.xgBoostTitle")}</p>

      {/* ── 기본 요약 카드 (항상 노출) ─────────────────────────── */}
      <div className={`rounded-xl border p-4 space-y-3 ${riskLevel.bg}`}>

        {/* 위험 수준 + 신뢰도 */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-[10px] text-chess-muted uppercase tracking-wide font-semibold">{t("pattern.riskLevel")}</p>
            <div className="flex items-center gap-1.5">
              <RiskIcon className={`text-base leading-none ${riskLevel.iconClass}`} size={16} />
              <span className={`text-xl font-black leading-none ${riskLevel.color}`}>{riskLevel.label}</span>
              <span className={`text-sm font-semibold opacity-70 ${riskLevel.color}`}>({risk.toFixed(0)}%)</span>
            </div>
          </div>
          <div className="text-right space-y-0.5 shrink-0 max-w-[150px]">
            <p className={`text-xs font-semibold ${confidence.color}`}>{confidence.label}</p>
            <p className="text-[10px] text-chess-muted leading-snug">{confidence.detail}</p>
          </div>
        </div>

        {/* 위험도 진행 바 */}
        <div className="w-full bg-chess-border/60 rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full ${riskLevel.bar}`} style={{ width: `${Math.min(risk, 100)}%` }} />
        </div>

        {/* 주요 위험 요인 */}
        {topFactor && (
          <div className="rounded-lg border border-chess-border/50 bg-chess-bg/60 px-3 py-2.5 space-y-0.5">
            <p className="text-[10px] text-chess-muted uppercase tracking-wide font-semibold">{t("pattern.topRiskFactor")}</p>
            <p className="text-xs font-semibold text-chess-primary">{topFactor.feature}</p>
            {topFactor.description && (
              <p className="text-xs text-chess-muted leading-snug">{topFactor.description}</p>
            )}
          </div>
        )}
      </div>

      {/* ── 상세 분석 접기/펼치기 ─────────────────────────────── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs text-chess-muted hover:text-chess-primary transition-colors py-1 px-0.5"
      >
        <span>{t("pattern.viewDetail")}</span>
        <span className="inline-flex items-center gap-1">
          {expanded ? <PixelCaretUpGlyph size={12} /> : <PixelCaretDownGlyph size={12} />}
          {expanded ? t("pattern.fold") : t("pattern.expand")}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-chess-border/40 pt-3">

          {/* 모델 성능 지표 (기술 지표 — 각 1줄 설명 포함) */}
          {hasTechMetrics && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-chess-muted uppercase tracking-wide font-semibold">{t("pattern.modelMetrics")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-chess-border bg-chess-bg/80 px-2.5 py-2 space-y-0.5">
                  <p className="text-xs font-semibold text-chess-primary">{t("pattern.precision").replace("{n}", String(safeNumber(profile.precision).toFixed(0)))}</p>
                  <p className="text-[10px] text-chess-muted leading-snug">{t("pattern.precisionDesc")}</p>
                </div>
                <div className="rounded-md border border-chess-border bg-chess-bg/80 px-2.5 py-2 space-y-0.5">
                  <p className="text-xs font-semibold text-chess-primary">{t("pattern.recall").replace("{n}", String(safeNumber(profile.recall).toFixed(0)))}</p>
                  <p className="text-[10px] text-chess-muted leading-snug">{t("pattern.recallDesc")}</p>
                </div>
                <div className="rounded-md border border-chess-border bg-chess-bg/80 px-2.5 py-2 space-y-0.5">
                  <p className="text-xs font-semibold text-chess-primary">{t("pattern.f1").replace("{n}", String(safeNumber(profile.f1).toFixed(0)))}</p>
                  <p className="text-[10px] text-chess-muted leading-snug">{t("pattern.f1Desc")}</p>
                </div>
                <div className="rounded-md border border-chess-border bg-chess-bg/80 px-2.5 py-2 space-y-0.5">
                  <p className={`text-xs font-semibold ${lift !== null && lift >= 0 ? "text-chess-win" : "text-amber-700"}`}>
                    {lift !== null ? t("pattern.lift").replace("{val}", `${lift >= 0 ? "+" : ""}${lift.toFixed(1)}`) : "—"}
                  </p>
                  <p className="text-[10px] text-chess-muted leading-snug">{t("pattern.liftDesc")}</p>
                </div>
              </div>
              {profile.quality_note && (
                <p className={`text-[10px] leading-snug px-1 ${meaningful ? "text-chess-win" : "text-amber-700"}`}>
                  {profile.quality_note}
                </p>
              )}
            </div>
          )}

          {/* 위험 요인 전체 목록 */}
          {profile.top_risk_factors.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-chess-muted uppercase tracking-wide font-semibold">{t("pattern.factorImpact")}</p>
              {profile.top_risk_factors.map((f, i) => (
                <div key={f.feature} className="rounded-xl border border-chess-border bg-chess-bg/70 p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-chess-muted w-4">#{i + 1}</span>
                      <span className="text-xs font-semibold text-chess-primary">{f.feature}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-700">{safeNumber(f.importance).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-chess-border/60 rounded-full h-1 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.min(safeNumber(f.importance) * 3, 100)}%` }} />
                  </div>
                  {f.description && <p className="text-xs text-chess-muted leading-snug">{f.description}</p>}
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-chess-muted text-right">
            {t("pattern.gamesAnalyzed").replace("{n}", String(games))}
            {profile.validation_support
              ? t("pattern.valSample").replace("{p}", String(safeNumber(profile.validation_support.positive))).replace("{n}", String(safeNumber(profile.validation_support.negative)))
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── K-Means 클러스터 카드 ──────────────────────────────────
function ClusterCard({ cluster }: { cluster: ClusterInfo }) {
  const { t } = useTranslation();
  const border =
    cluster.is_weakness ? "border-red-600/35 bg-red-600/6" :
    cluster.is_strength ? "border-emerald-700/35 bg-emerald-700/6" :
    "border-chess-border bg-chess-bg/80";
  const wrColor = cluster.win_rate >= 50 ? "text-chess-win" : "text-chess-loss";
  const wrBg    = cluster.win_rate >= 50 ? "bg-emerald-600" : "bg-red-600";
  return (
    <div className={`rounded-xl border p-3.5 space-y-2 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-chess-primary leading-snug">{cluster.label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {cluster.is_weakness && (
            <span className="inline-flex items-center gap-0.5 text-xs text-chess-loss font-bold">
              <PixelCaretDownGlyph size={12} className="text-chess-loss" />
              {t("pattern.weakness")}
            </span>
          )}
          {cluster.is_strength && <span className="text-xs text-chess-win font-bold">{t("pattern.strength")}</span>}
          <span className={`text-sm font-bold ${wrColor}`}>{cluster.win_rate.toFixed(0)}%</span>
        </div>
      </div>
      <div className="w-full bg-chess-border/60 rounded-full h-1 overflow-hidden">
        <div className={`h-full rounded-full ${wrBg}`} style={{ width: `${cluster.win_rate}%` }} />
      </div>
      <p className="text-xs text-chess-muted">{cluster.description}</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-chess-muted">{t("chart.gamesCount").replace("{n}", String(cluster.n_games))}</span>
        {cluster.key_traits.map((tItem) => (
          <span key={tItem} className="text-xs px-1.5 py-0.5 rounded-md bg-chess-bg text-chess-muted border border-chess-border">{tItem}</span>
        ))}
      </div>
    </div>
  );
}

// ─── 점수 바 ────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const safeScore = safePercent(score);
  const color = safeScore >= 65 ? "bg-emerald-600" : safeScore >= 45 ? "bg-amber-600" : "bg-red-600";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-chess-border/60 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${safeScore}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${safeScore >= 65 ? "text-chess-win" : safeScore >= 45 ? "text-amber-700" : "text-chess-loss"}`}>{Math.round(safeScore)}</span>
    </div>
  );
}

// ─── 패턴 카드 (재설계) ─────────────────────────────────────
function PatternCard({ p, highlight, onClick, isLastOdd }: { p: TacticalPattern; highlight: "strength" | "weakness" | null; onClick: () => void; isLastOdd?: boolean }) {
  const { t } = useTranslation();
  const categoryLabelMap = (() => {
    return {
      time: t("pattern.catTime"),
      position: t("pattern.catPosition"),
      opening: t("pattern.catOpening"),
      endgame: t("pattern.catEndgame"),
      balance: t("pattern.catBalance"),
    };
  })();
  const catColor = CATEGORY_COLOR[p.category] ?? "text-chess-muted";
  const catBg    = CATEGORY_BG[p.category]    ?? "bg-chess-bg border-chess-border";
  const border =
    highlight === "strength" ? "border-emerald-700/45 bg-emerald-700/6 hover:border-emerald-700/60" :
    highlight === "weakness" ? "border-red-600/40 bg-red-600/6 hover:border-red-600/55" :
    "border-chess-border bg-chess-bg/80 hover:border-chess-muted/60 hover:bg-chess-surface";

  const metricValue = Number.isFinite(p.key_metric_value ?? NaN) ? (p.key_metric_value as number) : null;
  const hasMetric = metricValue != null;
  const hasInsight = !!p.insight;
  const hasGames = (p.top_games?.length ?? 0) > 0;
  const insightBg = highlight === "strength"
    ? "bg-emerald-700/8 border-emerald-700/35 text-chess-win"
    : highlight === "weakness"
    ? "bg-red-600/8 border-red-600/35 text-chess-loss"
    : "bg-blue-700/8 border-blue-700/30 text-blue-800";

  return (
    <button
      onClick={p.insufficient_data ? undefined : onClick}
      disabled={p.insufficient_data}
      className={`relative rounded-xl border p-4 text-left w-full transition-all duration-150 group space-y-3
        ${p.insufficient_data
          ? "border-chess-border/50 bg-chess-bg/40 cursor-not-allowed"
          : `cursor-pointer ${border}`
        }${isLastOdd ? " lg:col-span-2" : ""}`}
    >
      {/* 데이터 부족 오버레이 */}
      {p.insufficient_data && (
        <div className="absolute inset-0 rounded-xl z-10 flex flex-col items-center justify-center gap-2
                        bg-chess-bg/75 backdrop-blur-[2px]">
          <PixelChartGlyph className="text-chess-muted" size={20} />
          <span className="text-xs font-bold text-chess-muted">{t("pattern.lackData")}</span>
          <span className="text-[10px] text-chess-muted/80 text-center px-4 leading-snug">
            {t("pattern.lackDataDesc1")}<br />{t("pattern.lackDataDesc2")}
          </span>
        </div>
      )}

      {/* 헤더: icon + label + 상황번호 + 카테고리 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base leading-none">{p.icon}</span>
          <span className="text-sm font-semibold text-chess-primary truncate">{p.label}</span>
          {p.situation_id != null && p.situation_id > 0 && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-chess-bg text-chess-muted border border-chess-border font-mono shrink-0">#{p.situation_id}</span>
          )}
          {highlight === "strength" && <PixelStarGlyph className="shrink-0" size={12} />}
          {highlight === "weakness" && (
            <PixelCaretDownGlyph size={12} className="shrink-0 text-chess-loss" />
          )}
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded-md border shrink-0 ${catBg} ${catColor}`}>
          {(categoryLabelMap as any)[p.category] ?? p.category}
        </span>
      </div>

      {/* BIG METRIC */}
      {hasMetric && (
        <div className="flex items-end gap-2">
          <span className={`text-3xl font-black leading-none ${
            highlight === "strength" ? "text-chess-win" :
            highlight === "weakness" ? "text-chess-loss" :
            "text-chess-primary"
          }`}>
            {metricValue!.toFixed(p.key_metric_unit === "cp" ? 1 : 0)}
          </span>
          <span className="text-lg font-bold text-chess-muted leading-none pb-0.5">{p.key_metric_unit}</span>
          {p.key_metric_label && (
            <span className="text-xs text-chess-muted leading-none pb-0.5 ml-1">{p.key_metric_label}</span>
          )}
        </div>
      )}

      {/* ML 인사이트 문장 */}
      {hasInsight && (
        <div className={`rounded-lg border px-3 py-2.5 ${insightBg}`}>
          <p className="text-xs font-medium leading-snug">{p.insight}</p>
        </div>
      )}

      {/* 점수 바 */}
      <ScoreBar score={p.score} />

      {/* 우위 유지력 — 미니 스택 바 */}
      {p.chart_data?.type === "advantage_breakdown" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-chess-muted">
            <span>{t("pattern.advSummary")}</span>
            <span>
              {t("pattern.scanCondition").replace("{scan}", String(safeNumber(p.chart_data.scan_pool))).replace("{total}", String(safeNumber(p.chart_data.total)))}
            </span>
          </div>
          <div className="w-full flex h-2 rounded-full overflow-hidden gap-px">
            <div className="bg-emerald-600 h-full" style={{ width: `${safePercent(p.chart_data.maintain_rate)}%` }} />
            <div className="bg-amber-600 h-full"   style={{ width: `${safePercent(p.chart_data.total > 0 ? (safeNumber(p.chart_data.reversed_mid) / p.chart_data.total) * 100 : 0)}%` }} />
            <div className="bg-red-600 h-full"     style={{ width: `${safePercent(p.chart_data.total > 0 ? (safeNumber(p.chart_data.reversed_end) / p.chart_data.total) * 100 : 0)}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="rounded-md border border-emerald-700/25 bg-emerald-700/8 px-2 py-1">
              <p className="text-chess-win font-semibold">{t("pattern.maintainSuccess")}</p>
              <p className="text-chess-primary font-bold">{safeNumber(p.chart_data.maintained ?? p.chart_data.converted)}</p>
            </div>
            <div className="rounded-md border border-amber-700/25 bg-amber-700/8 px-2 py-1">
              <p className="text-amber-700 font-semibold">{t("pattern.midReversal")}</p>
              <p className="text-chess-primary font-bold">{safeNumber(p.chart_data.reversed_mid ?? p.chart_data.shaky)}</p>
            </div>
            <div className="rounded-md border border-red-700/25 bg-red-700/8 px-2 py-1">
              <p className="text-chess-loss font-semibold">{t("pattern.endReversal")}</p>
              <p className="text-chess-primary font-bold">{safeNumber(p.chart_data.reversed_end ?? p.chart_data.blown)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 분석 근거 */}
      <p className="text-xs text-chess-muted leading-snug">{p.detail}</p>

      {/* 예시 게임 / 목록 버튼 */}
      <div className="flex items-center justify-between">
        {p.example_game?.url ? (
          <div className="space-y-0.5">
            {p.example_game.hint && <p className="text-[10px] text-chess-muted leading-snug">{p.example_game.hint}</p>}
            <a
              href={toAnalysisUrl(p.example_game.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-chess-win/80 hover:text-chess-win transition-colors"
            >
              <PixelPawnGlyph size={12} />
              <span>{t("pattern.exampleGame").replace(/\s*→\s*$/, "")}</span>
              <span>→</span>
            </a>
          </div>
        ) : <span />}
        {hasGames && (
          <span className="text-[10px] text-chess-muted group-hover:text-chess-primary transition-colors">
            {p.top_games!.length}게임 목록 →
          </span>
        )}
      </div>
    </button>
  );
}

// ─── 강점/약점 요약 바 ──────────────────────────────────────
function SummaryRow({ data, onSelect }: { data: TacticalAnalysis; onSelect: (p: TacticalPattern) => void }) {
  const { t } = useTranslation();
  if (!data.strengths.length && !data.weaknesses.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-emerald-700/8 border border-emerald-700/30 p-4">
        <p className="text-xs font-bold text-chess-win uppercase tracking-wide mb-2.5">{t("pattern.topStrengths")}</p>
        {data.strengths.map((p) => (
          <button key={p.label} onClick={() => onSelect(p)} className="flex items-center gap-1.5 py-1 w-full text-left hover:opacity-80 transition-opacity">
            <span className="text-sm">{p.icon}</span>
            <span className="text-chess-primary text-xs font-medium flex-1 truncate">{p.label}</span>
            <span className="ml-auto text-chess-win text-xs font-bold">{p.score}</span>
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-red-600/8 border border-red-600/30 p-4">
        <p className="text-xs font-bold text-chess-loss uppercase tracking-wide mb-2.5">{t("pattern.needsImprovement")}</p>
        {data.weaknesses.map((p) => (
          <button key={p.label} onClick={() => onSelect(p)} className="flex items-center gap-1.5 py-1 w-full text-left hover:opacity-80 transition-opacity">
            <span className="text-sm">{p.icon}</span>
            <span className="text-chess-primary text-xs font-medium flex-1 truncate">{p.label}</span>
            <span className="ml-auto text-chess-loss text-xs font-bold">{p.score}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────
export default function TacticalPatternsCard({ data, isLoading }: Props) {
  const { t } = useTranslation();
  const [selectedPattern, setSelectedPattern] = useState<TacticalPattern | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  if (isLoading || !data) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-chess-border rounded-xl" />)}
      </div>
    );
  }

  if (!data.patterns.length) {
    return <p className="text-chess-muted text-sm py-8 text-center">{t("pattern.notEnoughDataMain")}</p>;
  }

  const strengthSet = new Set(data.strengths.map((p) => p.label));
  const weaknessSet = new Set(data.weaknesses.map((p) => p.label));

  const filteredPatterns = activeTab === "all"
    ? data.patterns
    : data.patterns.filter((p) => p.category === activeTab);
  const aiInsights = (data as TacticalAnalysis & { ai_insights?: AiInsights | null }).ai_insights;

  // 탭에 패턴이 있는지 확인 (빈 탭 숨김)
  const tabCounts = Object.fromEntries(
    TABS.map((t) => [t.id, t.id === "all" ? data.patterns.length : data.patterns.filter((p) => p.category === t.id).length])
  );

  return (
    <>
      <PatternGameListModal pattern={selectedPattern} onClose={() => setSelectedPattern(null)} />
      <div className="space-y-6">

        {/* 강점/약점 요약 */}
        <SummaryRow data={data} onSelect={setSelectedPattern} />

        {/* AI 코치 */}
        <AiInsightsSection insights={aiInsights} />

        {/* K-Means */}
        {data.cluster_analysis && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-chess-muted uppercase tracking-wider font-bold">{t("pattern.styleAnalysis")}</p>
              <span className="text-xs text-chess-muted">{t("pattern.styleSummary").replace("{win}", String(data.cluster_analysis.overall_win_rate.toFixed(0))).replace("{types}", String(data.cluster_analysis.n_clusters))}</span>
            </div>
            <p className="text-xs text-chess-muted pb-0.5">{data.cluster_analysis.summary}</p>
            <div className="space-y-2">{data.cluster_analysis.clusters.map((c) => <ClusterCard key={c.id} cluster={c} />)}</div>
          </div>
        )}

        {/* XGBoost */}
        {data.xgboost_profile && <XGBoostProfileSection profile={data.xgboost_profile} />}

        {/* 패턴 탭 + 그리드 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-chess-muted uppercase tracking-wider font-bold">{t("pattern.detailAnalysis")}</p>
            <span className="text-xs text-chess-muted">{t("pattern.nPatterns").replace("{n}", String(data.patterns.length))}</span>
          </div>

          {/* 탭 바 */}
          <div className="flex gap-1.5 flex-wrap">
            {TABS.filter((tb) => tabCounts[tb.id] > 0).map((tab) => {
              const TabIcon = tab.Icon;
              return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                  activeTab === tab.id
                    ? "bg-chess-inverse border-chess-inverse text-white font-semibold"
                    : "bg-chess-bg border-chess-border text-chess-muted hover:border-chess-muted hover:text-chess-primary"
                }`}
              >
                <TabIcon size={14} className="opacity-90" />
                <span>{tab.id === 'all' ? t("pattern.tabAll") : tab.id === 'time' ? t("pattern.tabTime") : tab.id === 'position' ? t("pattern.tabPosition") : tab.id === 'opening' ? t("pattern.tabOpening") : t("pattern.tabEndgame")}</span>
                <span className={`text-[10px] ml-0.5 ${activeTab === tab.id ? "text-chess-bg/80" : "text-chess-muted"}`}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            );})}
          </div>

          {/* 패턴 카드 그리드 */}
          {filteredPatterns.length === 0 ? (
            <p className="text-xs text-chess-muted py-4 text-center">{t("pattern.emptyCategory")}</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {filteredPatterns.map((p, i) => (
                <PatternCard
                  key={p.label}
                  p={p}
                  highlight={strengthSet.has(p.label) ? "strength" : weaknessSet.has(p.label) ? "weakness" : null}
                  onClick={() => setSelectedPattern(p)}
                  isLastOdd={filteredPatterns.length % 2 === 1 && i === filteredPatterns.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-chess-muted text-center">
          {t("pattern.footerSummary").replace("{g}", String(data.total_games)).replace("{p}", String(data.patterns.length))}
          {data.xgboost_profile ? t("pattern.withRisk") : ""}
          {data.cluster_analysis ? t("pattern.withStyle") : ""}
        </p>
      </div>
    </>
  );
}
