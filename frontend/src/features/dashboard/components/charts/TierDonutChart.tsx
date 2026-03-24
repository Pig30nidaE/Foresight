"use client";

import { useMemo, useEffect, useState, useId } from "react";
import type { MoveTier } from "@/shared/types";
import { useTranslation, type I18nKey } from "@/shared/lib/i18n";

interface TierDonutChartProps {
  tierPercentages: Record<MoveTier, number>;
  tierCounts: Record<MoveTier, number>;
  accuracy: number;
  size?: number;
  strokeWidth?: number;
}

type TierGroup = "good" | "neutral" | "risk";

/* 다크 배경에서도 무난한 채도의 에메랄드·앰버·코랄 */
const TIER_META: Record<MoveTier, { group: TierGroup; stroke: string; labelKey: I18nKey }> = {
  TH: { group: "good", stroke: "#2d9f72", labelKey: "tier.TH" },
  TF: { group: "good", stroke: "#2d9f72", labelKey: "tier.TF" },
  T1: { group: "good", stroke: "#2d9f72", labelKey: "tier.T1" },
  T2: { group: "good", stroke: "#2d9f72", labelKey: "tier.T2" },
  T3: { group: "good", stroke: "#2d9f72", labelKey: "tier.T3" },

  T4: { group: "neutral", stroke: "#c9a227", labelKey: "tier.T4" },
  T5: { group: "neutral", stroke: "#c9a227", labelKey: "tier.T5" },

  T6: { group: "risk", stroke: "#d97066", labelKey: "tier.T6" },
};

function withAlpha(hex: string, alpha: number) {
  // hex: #rrggbb
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function TierDonutChart({
  tierPercentages,
  tierCounts,
  accuracy,
  size = 200,
  strokeWidth = 24,
}: TierDonutChartProps) {
  const { t } = useTranslation();
  const uid = useId().replace(/:/g, "");
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Delay animation trigger slightly for effect
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const segments = useMemo(() => {
    const tiers: MoveTier[] = ["TH", "TF", "T1", "T2", "T3", "T4", "T5", "T6"];
    let currentOffset = 0;

    return tiers.map((tier, idx) => {
      const percentage = tierPercentages[tier] || 0;
      const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;

      const meta = TIER_META[tier];
      // Premium look: avoid vivid colors; vary only alpha slightly.
      const alphaBase =
        meta.group === "good" ? 0.88 :
        meta.group === "neutral" ? 0.65 :
        0.60;
      const alpha = Math.max(0.18, alphaBase - (idx / (tiers.length - 1)) * (meta.group === "risk" ? 0.20 : 0.35));

      const segment = {
        tier,
        percentage,
        count: tierCounts[tier] || 0,
        stroke: withAlpha(meta.stroke, alpha),
        strokeDasharray,
        offset: currentOffset,
        startOffset: currentOffset + circumference,
      };

      currentOffset -= (percentage / 100) * circumference;
      return segment;
    });
  }, [tierPercentages, tierCounts, circumference]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative group">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          style={{ filter: "drop-shadow(3px 3px 0 rgba(0,0,0,0.4))" }}
        >
          <defs>
            <pattern id={`${uid}-track`} width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="rgba(120,120,120,0.2)" />
              <rect x="0" y="0" width="1" height="1" fill="rgba(0,0,0,0.2)" />
              <rect x="2" y="2" width="1" height="1" fill="rgba(0,0,0,0.2)" />
            </pattern>
            {segments.map((s) => (
              <pattern
                key={`pat-${s.tier}`}
                id={`${uid}-seg-${s.tier}`}
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
              >
                <rect width="4" height="4" fill={s.stroke} />
                <rect x="0" y="0" width="2" height="2" fill="rgba(0,0,0,0.18)" />
                <rect x="2" y="2" width="2" height="2" fill="rgba(255,255,255,0.1)" />
              </pattern>
            ))}
          </defs>

          {/* Background Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${uid}-track)`}
            strokeWidth={strokeWidth}
          />
          
          {/* Active Data Segments */}
          {segments.map((segment) => {
            if (segment.percentage === 0) return null;
            return (
              <circle
                key={segment.tier}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={`url(#${uid}-seg-${segment.tier})`}
                strokeWidth={strokeWidth}
                strokeDasharray={segment.strokeDasharray}
                strokeDashoffset={mounted ? segment.offset : segment.startOffset}
                strokeLinecap="butt"
                className="transition-all duration-[1200ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] origin-center"
              />
            );
          })}
        </svg>
        
        {/* Center content (Accuracy) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="flex flex-col items-center border-[3px] border-chess-border bg-chess-bg pixel-hud-fill shadow-[inset_2px_2px_0_rgba(255,255,255,0.1),2px_2px_0_rgba(0,0,0,0.2)]"
            style={{
              width: size - strokeWidth * 2 - 14,
              height: size - strokeWidth * 2 - 14,
              justifyContent: "center",
            }}
          >
            <span className="font-pixel text-3xl font-bold text-chess-primary tracking-tight">
              {accuracy.toFixed(1)}
              <span className="text-lg text-chess-muted/80">%</span>
            </span>
            <span className="font-pixel text-[10px] sm:text-xs font-bold text-chess-muted mt-1">
              {t("chart.accuracy")}
            </span>
          </div>
        </div>
      </div>

      {/* Legend / Stats Grid */}
      <div className="mt-6 w-full grid grid-cols-3 sm:grid-cols-4 gap-2">
        {segments.map((segment) => {
          const isEmpty = segment.count === 0;
          const meta = TIER_META[segment.tier];
          return (
            <div 
              key={segment.tier} 
              className={`flex flex-col items-center p-2 transition-colors duration-200 ${
                isEmpty
                  ? "opacity-40 border-2 border-transparent"
                  : "pixel-frame pixel-hud-fill hover:brightness-[1.03]"
              }`}
            >
              <div
                className="w-10 h-2 mb-2 border-2 border-chess-primary/25"
                style={{
                  backgroundColor: segment.stroke,
                  backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px)`,
                }}
              />
              <span className="font-pixel text-xs font-bold text-chess-primary">
                {segment.tier} {t(meta.labelKey)}
              </span>
              <span className="text-[10px] text-chess-muted font-medium mt-0.5">
                {segment.percentage.toFixed(0)}% ({t("chart.moves").replace("{n}", String(segment.count))})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
