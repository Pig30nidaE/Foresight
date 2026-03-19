"use client";

import { useMemo, useEffect, useState } from "react";
import type { MoveTier } from "@/shared/types";
import { useTranslation } from "@/shared/lib/i18n";

interface TierDonutChartProps {
  tierPercentages: Record<MoveTier, number>;
  tierCounts: Record<MoveTier, number>;
  accuracy: number;
  size?: number;
  strokeWidth?: number;
}

const TIER_CONFIG: Record<MoveTier, { color: string; gradient: string[]; label: string; emoji: string }> = {
  TH: { color: "#8b5cf6", gradient: ["#a78bfa", "#8b5cf6"], label: "이론", emoji: "TH" },
  T1: { color: "#10b981", gradient: ["#34d399", "#10b981"], label: "최상", emoji: "★" },
  T2: { color: "#34d399", gradient: ["#6ee7b7", "#34d399"], label: "우수", emoji: "✓" },
  T3: { color: "#6ee7b7", gradient: ["#a7f3d0", "#6ee7b7"], label: "양호", emoji: "○" },
  T4: { color: "#fbbf24", gradient: ["#fcd34d", "#fbbf24"], label: "보통", emoji: "△" },
  T5: { color: "#ef4444", gradient: ["#f87171", "#ef4444"], label: "불량", emoji: "✗" },
};

export default function TierDonutChart({
  tierPercentages,
  tierCounts,
  accuracy,
  size = 200,
  strokeWidth = 24,
}: TierDonutChartProps) {
  const { t } = useTranslation();
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
    const tiers: MoveTier[] = ["TH", "T1", "T2", "T3", "T4", "T5"];
    let currentOffset = 0;
    
    return tiers.map((tier) => {
      const percentage = tierPercentages[tier] || 0;
      const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
      const segment = {
        tier,
        percentage,
        count: tierCounts[tier] || 0,
        color: TIER_CONFIG[tier].color,
        gradient: TIER_CONFIG[tier].gradient,
        label: TIER_CONFIG[tier].label,
        emoji: TIER_CONFIG[tier].emoji,
        strokeDasharray,
        offset: currentOffset,
        // Start dashed offset at full circumference to hide, then animate to real offset
        startOffset: currentOffset + circumference,
      };
      currentOffset -= (percentage / 100) * circumference;
      return segment;
    });
  }, [tierPercentages, tierCounts, circumference]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative group">
        <svg width={size} height={size} className="transform -rotate-90 filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
          <defs>
            {segments.map((s) => (
              <linearGradient key={`grad-${s.tier}`} id={`grad-${s.tier}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={s.gradient[0]} />
                <stop offset="100%" stopColor={s.gradient[1]} />
              </linearGradient>
            ))}
            {/* Soft inner shadow definition if needed, or just rely on CSS drop-shadow */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
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
                stroke={`url(#grad-${segment.tier})`}
                strokeWidth={strokeWidth}
                strokeDasharray={segment.strokeDasharray}
                strokeDashoffset={mounted ? segment.offset : segment.startOffset}
                strokeLinecap="round" // Rounded caps for premium look
                className="transition-all duration-[1200ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] origin-center"
              />
            );
          })}
        </svg>
        
        {/* Center content (Accuracy) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex flex-col items-center bg-chess-surface/30 backdrop-blur-md rounded-full shadow-inner border border-white/5" style={{ width: size - strokeWidth * 2 - 20, height: size - strokeWidth * 2 - 20, justifyContent: 'center' }}>
            <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 tracking-tight">
              {accuracy.toFixed(1)}<span className="text-lg text-white/50">%</span>
            </span>
            <span className="text-[10px] sm:text-xs font-semibold text-chess-muted tracking-wide uppercase mt-1">{t("chart.accuracy")}</span>
          </div>
        </div>
      </div>

      {/* Legend / Stats Grid */}
      <div className="mt-6 w-full grid grid-cols-3 sm:grid-cols-6 gap-2">
        {segments.map((segment) => {
          const isEmpty = segment.count === 0;
          return (
            <div 
              key={segment.tier} 
              className={`flex flex-col items-center p-2 rounded-xl border transition-all duration-300 ${
                isEmpty ? 'opacity-40 border-transparent bg-transparent' : 'bg-chess-surface/40 border-white/5 hover:bg-chess-surface/60 hover:scale-105'
              }`}
            >
              <div
                className="w-10 h-1 rounded-full mb-2 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                style={{ backgroundColor: segment.color, boxShadow: `0 0 8px ${segment.color}80` }}
              />
              <span className="text-xs font-bold text-chess-primary tracking-wide">
                {segment.emoji} {t(`tier.${segment.tier}` as any)}
              </span>
              <span className="text-[10px] text-chess-muted font-medium mt-0.5">
                {t("chart.moves").replace("{n}", String(segment.count))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
