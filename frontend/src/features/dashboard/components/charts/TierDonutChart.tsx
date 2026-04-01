"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { MoveTier } from "@/shared/types";
import { useTranslation, type I18nKey } from "@/shared/lib/i18n";

interface TierDonutChartProps {
  tierPercentages: Record<MoveTier, number>;
  tierCounts: Record<MoveTier, number>;
  size?: number;
  strokeWidth?: number;
}

const TIER_ORDER: MoveTier[] = ["TH", "TF", "T1", "T2", "T3", "T4", "T5", "T6"];

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

// Custom Tooltip component for Recharts
const CustomTooltip = ({ active, payload, t }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const meta = TIER_META[data.tier as MoveTier];
    return (
      <div className="bg-slate-900/95 border border-slate-700 text-white rounded-lg shadow-xl p-3 text-sm min-w-[140px] z-50 pointer-events-none">
        <p className="font-bold flex items-center gap-2 mb-1 text-slate-100">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }} />
          {data.tier} - {t(meta.labelKey)}
        </p>
        <p className="text-slate-300 font-medium">
          {data.count} / {data.total} ({data.percentage.toFixed(1)}%)
        </p>
      </div>
    );
  }
  return null;
};

export default function TierDonutChart({
  tierPercentages,
  tierCounts,
  size = 200,
  strokeWidth = 24, // Use as pie chart thickness
}: TierDonutChartProps) {
  const { t } = useTranslation();

  const totalMoves = useMemo(
    () => TIER_ORDER.reduce((s, tTier) => s + (Number(tierCounts[tTier]) || 0), 0),
    [tierCounts]
  );

  const data = useMemo(() => {
    return TIER_ORDER.map((tier) => ({
      tier,
      name: tier,
      percentage: tierPercentages[tier] || 0,
      count: tierCounts[tier] || 0,
      total: totalMoves,
      color: TIER_RING_COLOR[tier],
    })).filter((item) => item.count > 0);
  }, [tierPercentages, tierCounts, totalMoves]);

  const innerRadius = (size / 2) - strokeWidth * 1.5;
  const outerRadius = size / 2;

  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };
  const onPieLeave = () => {
    setActiveIndex(undefined);
  };

  const ariaLabel = useMemo(() => {
    if (totalMoves <= 0) return t("chart.moves").replace("{n}", "0");
    const parts = data.map((s) => `${s.tier} ${s.percentage.toFixed(0)}%`);
    return `${t("chart.moves").replace("{n}", String(totalMoves))}. ${parts.join(", ")}`;
  }, [data, totalMoves, t]);

  return (
    <div className="flex flex-col items-center w-full">
      <div 
        className="relative shrink-0 flex items-center justify-center p-2"
        style={{ width: size + 20, height: size + 20 }}
        role="img"
        aria-label={ariaLabel}
      >
        {totalMoves > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                paddingAngle={2}
                dataKey="count"
                stroke="none"
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color} 
                    opacity={activeIndex === undefined || activeIndex === index ? 1 : 0.3}
                    className="transition-opacity duration-200 outline-none"
                  />
                ))}
              </Pie>
              <Tooltip 
                content={<CustomTooltip t={t} />} 
                wrapperStyle={{ outline: 'none', zIndex: 100 }}
                isAnimationActive={false}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div 
            className="rounded-full border-[12px] border-chess-border/20 flex items-center justify-center"
            style={{ width: size, height: size }}
          >
            <span className="text-chess-muted text-[13px] font-medium">No Moves</span>
          </div>
        )}

        {/* Center UI - Pure minimal */}
        {totalMoves > 0 && (
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-2xl sm:text-3xl font-black leading-tight text-slate-800 dark:text-slate-100 tabular-nums">
              {totalMoves}
            </span>
            <span className="mt-0.5 text-[10px] sm:text-xs font-bold uppercase leading-tight tracking-wider text-slate-400 dark:text-slate-500">
               {t("chart.moves").replace("{n}", "").replace(/[0-9]/g, "").trim() || "Moves"}
            </span>
          </div>
        )}
      </div>

      {/* Legend / Info Badges (Non-Pixel style) */}
      <div className="max-w-xs mt-4 w-full flex flex-wrap justify-center gap-2">
        {data.map((segment, index) => {
          const isHovered = activeIndex === index;
          return (
            <div
              key={segment.tier}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={onPieLeave}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 cursor-default border ${
                 isHovered 
                   ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" 
                   : "bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {segment.tier}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                {segment.percentage.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
