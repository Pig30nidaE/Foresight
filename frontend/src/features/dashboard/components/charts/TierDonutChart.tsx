"use client";

import { useMemo } from "react";
import type { MoveTier } from "@/shared/types";
import { useTranslation, type I18nKey } from "@/shared/lib/i18n";

interface TierDonutChartProps {
  tierPercentages: Record<MoveTier, number>;
  tierCounts: Record<MoveTier, number>;
  size?: number;
  strokeWidth?: number;
}

const TIER_ORDER: MoveTier[] = ["TH", "TF", "T1", "T2", "T3", "T4", "T5", "T6"];

/** 기보 티어 뱃지와 동일 팔레트 — 링 구간이 등급과 1:1로 대응 */
const TIER_RING_COLOR: Record<MoveTier, string> = {
  TH: "#8b5cf6",
  TF: "#0ea5e9",
  T1: "#22c55e",
  T2: "#10b981",
  T3: "#34d399",
  T4: "#84cc16",
  T5: "#f59e0b",
  T6: "#ef4444",
};

const TIER_META: Record<MoveTier, { labelKey: I18nKey }> = {
  TH: { labelKey: "tier.TH" },
  TF: { labelKey: "tier.TF" },
  T1: { labelKey: "tier.T1" },
  T2: { labelKey: "tier.T2" },
  T3: { labelKey: "tier.T3" },
  T4: { labelKey: "tier.T4" },
  T5: { labelKey: "tier.T5" },
  T6: { labelKey: "tier.T6" },
};

function buildConicGradient(tiers: MoveTier[], tierCounts: Record<MoveTier, number>): string {
  const totalMoves = tiers.reduce((s, t) => s + (Number(tierCounts[t]) || 0), 0);
  if (totalMoves <= 0) {
    return "conic-gradient(from -90deg, rgba(120,120,120,0.25) 0% 100%)";
  }

  const stops: string[] = [];
  let accPct = 0;

  for (const tier of tiers) {
    const c = Number(tierCounts[tier]) || 0;
    if (c <= 0) continue;
    const span = (c / totalMoves) * 100;
    const start = accPct;
    accPct += span;
    const color = TIER_RING_COLOR[tier];
    stops.push(`${color} ${start}% ${accPct}%`);
  }

  if (accPct < 99.5) {
    stops.push(`rgba(160, 160, 150, 0.35) ${accPct}% 100%`);
  }

  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

export default function TierDonutChart({
  tierPercentages,
  tierCounts,
  size = 200,
  strokeWidth = 24,
}: TierDonutChartProps) {
  const { t } = useTranslation();

  const totalMoves = useMemo(
    () => TIER_ORDER.reduce((s, t) => s + (Number(tierCounts[t]) || 0), 0),
    [tierCounts]
  );

  const conicBackground = useMemo(() => buildConicGradient(TIER_ORDER, tierCounts), [tierCounts]);

  const segments = useMemo(() => {
    return TIER_ORDER.map((tier) => ({
      tier,
      percentage: tierPercentages[tier] || 0,
      count: tierCounts[tier] || 0,
      color: TIER_RING_COLOR[tier],
    }));
  }, [tierPercentages, tierCounts]);

  const innerSize = Math.max(size - strokeWidth * 2, size * 0.45);

  const ariaLabel = useMemo(() => {
    if (totalMoves <= 0) return t("chart.moves").replace("{n}", "0");
    const parts = segments
      .filter((s) => s.count > 0)
      .map((s) => `${s.tier} ${s.percentage.toFixed(0)}%`);
    return `${t("chart.moves").replace("{n}", String(totalMoves))}. ${parts.join(", ")}`;
  }, [segments, totalMoves, t]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={ariaLabel}
      >
        <div
          className="absolute inset-0 rounded-full border-2 border-chess-border/80 shadow-[2px_2px_0_rgba(0,0,0,0.12)] dark:border-chess-border/50"
          style={{ background: conicBackground }}
        />
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-[3px] border-chess-border bg-chess-bg px-2 py-2 text-center pixel-hud-fill shadow-[inset_2px_2px_0_rgba(255,255,255,0.1),2px_2px_0_rgba(0,0,0,0.15)] dark:border-chess-border dark:bg-chess-surface"
          style={{
            width: innerSize,
            height: innerSize,
            maxWidth: "92%",
            maxHeight: "92%",
          }}
        >
          <span className="font-pixel text-lg font-bold leading-tight text-chess-primary tabular-nums sm:text-xl">
            {t("chart.moves").replace("{n}", String(totalMoves))}
          </span>
          <span className="mt-1 font-pixel text-[9px] font-bold uppercase leading-tight tracking-wide text-chess-muted sm:text-[10px]">
            {t("chart.tierRatio")}
          </span>
        </div>
      </div>

      <div className="mt-6 w-full grid grid-cols-3 gap-2 sm:grid-cols-4">
        {segments.map((segment) => {
          const isEmpty = segment.count === 0;
          const meta = TIER_META[segment.tier];
          return (
            <div
              key={segment.tier}
              className={`flex flex-col items-center p-2 transition-colors duration-200 ${
                isEmpty
                  ? "border-2 border-transparent opacity-40"
                  : "pixel-frame pixel-hud-fill hover:brightness-[1.03]"
              }`}
            >
              <div
                className="mb-2 h-2 w-10 border-2 border-chess-primary/25"
                style={{
                  backgroundColor: segment.color,
                  backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 3px)`,
                }}
              />
              <span className="text-center font-pixel text-[10px] font-bold leading-tight text-chess-primary sm:text-xs">
                {segment.tier} {t(meta.labelKey)}
              </span>
              <span className="mt-0.5 text-[15px] font-medium text-chess-muted tabular-nums">
                {segment.percentage.toFixed(0)}% ({t("chart.moves").replace("{n}", String(segment.count))})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
