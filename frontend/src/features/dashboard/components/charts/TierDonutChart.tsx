"use client";

import { useMemo } from "react";
import type { MoveTier } from "@/shared/types";

interface TierDonutChartProps {
  tierPercentages: Record<MoveTier, number>;
  tierCounts: Record<MoveTier, number>;
  accuracy: number;
  size?: number;
  strokeWidth?: number;
}

const TIER_CONFIG: Record<MoveTier, { color: string; label: string; emoji: string }> = {
  T1: { color: "#10b981", label: "최상", emoji: "★" },
  T2: { color: "#34d399", label: "우수", emoji: "✓" },
  T3: { color: "#6ee7b7", label: "양호", emoji: "○" },
  T4: { color: "#fbbf24", label: "보통", emoji: "△" },
  T5: { color: "#ef4444", label: "불량", emoji: "✗" },
};

export default function TierDonutChart({
  tierPercentages,
  tierCounts,
  accuracy,
  size = 160,
  strokeWidth = 20,
}: TierDonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // 각 등급의 오프셋 계산
  const segments = useMemo(() => {
    const tiers: MoveTier[] = ["T1", "T2", "T3", "T4", "T5"];
    let currentOffset = 0;
    
    return tiers.map((tier) => {
      const percentage = tierPercentages[tier] || 0;
      const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
      const segment = {
        tier,
        percentage,
        count: tierCounts[tier] || 0,
        color: TIER_CONFIG[tier].color,
        label: TIER_CONFIG[tier].label,
        emoji: TIER_CONFIG[tier].emoji,
        strokeDasharray,
        offset: currentOffset,
      };
      currentOffset -= (percentage / 100) * circumference;
      return segment;
    });
  }, [tierPercentages, tierCounts, circumference]);

  return (
    <div className="flex flex-col items-center">
      {/* 도넛 차트 SVG */}
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* 배경 원 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#374151"
            strokeWidth={strokeWidth}
            opacity={0.3}
          />
          
          {/* 각 등급 세그먼트 */}
          {segments.map((segment) => (
            <circle
              key={segment.tier}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={segment.strokeDasharray}
              strokeDashoffset={segment.offset}
              strokeLinecap="butt"
              className="transition-all duration-500 ease-out"
            />
          ))}
        </svg>
        
        {/* 중앙 텍스트 (정확도) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-chess-primary">{accuracy.toFixed(1)}%</span>
          <span className="text-xs text-chess-muted">정확도</span>
        </div>
      </div>

      {/* 범례 */}
      <div className="mt-4 grid grid-cols-5 gap-2 text-center">
        {segments.map((segment) => (
          <div key={segment.tier} className="flex flex-col items-center">
            <div
              className="w-3 h-3 rounded-full mb-1"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-xs font-medium text-chess-primary">
              {segment.emoji} {segment.tier}
            </span>
            <span className="text-xs text-chess-muted">
              {segment.count}수 ({segment.percentage.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
