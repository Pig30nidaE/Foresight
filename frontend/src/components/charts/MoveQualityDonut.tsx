"use client";

import {
  Cell,
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MoveQualityStats } from "@/types";

// 플레이스홀더 (엔진 분석 결과 없을 때)
const PLACEHOLDER = [
  { category: "Best",       emoji: "✅", color: "#10b981", count: 0, percentage: 0 },
  { category: "Excellent",  emoji: "👍", color: "#34d399", count: 0, percentage: 0 },
  { category: "Good",       emoji: "🆗", color: "#6ee7b7", count: 0, percentage: 0 },
  { category: "Inaccuracy", emoji: "⚡", color: "#f59e0b", count: 0, percentage: 0 },
  { category: "Mistake",    emoji: "❌", color: "#f97316", count: 0, percentage: 0 },
  { category: "Blunder",    emoji: "💀", color: "#ef4444", count: 0, percentage: 0 },
];

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { color: string; count: number } }[];
}) => {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs">
      <p className="font-bold text-white">{name}</p>
      <p className="text-zinc-300">{value}% ({p.count}수)</p>
    </div>
  );
};

interface Props {
  data?: MoveQualityStats | null;
  isLoading?: boolean;
}

export default function MoveQualityDonut({ data, isLoading = false }: Props) {
  const hasData = !!data && data.total_moves > 0;
  const cats = hasData ? data.categories : PLACEHOLDER;
  // placeholder 시엔 균등 분배로 회색톤 표시
  const chartData = hasData
    ? cats.filter((c) => c.percentage > 0)
    : PLACEHOLDER.map((c) => ({ ...c, percentage: 100 / 6 }));

  return (
    <div className="flex flex-col items-center">
      {/* 상태 배지 */}
      {isLoading && (
        <p className="text-xs text-zinc-400 mb-2 animate-pulse">
          🔍 Stockfish 분석 중... (최대 ~30초)
        </p>
      )}
      {!isLoading && !hasData && (
        <p className="text-xs text-amber-400/80 mb-2 text-center">
          ⚡ 엔진 분석을 위해 잠시 기다려 주세요
        </p>
      )}

      {/* 정확도 + ACPL 헤더 */}
      {hasData && (
        <div className="flex gap-6 mb-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {data!.accuracy.toFixed(1)}%
            </p>
            <p className="text-xs text-zinc-500">정확도</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-300">
              {data!.acpl.toFixed(0)}
            </p>
            <p className="text-xs text-zinc-500">평균 CP 손실</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-300">
              {data!.games_analyzed}
            </p>
            <p className="text-xs text-zinc-500">분석 게임</p>
          </div>
        </div>
      )}

      {/* 도넛 차트 */}
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={78}
            paddingAngle={2}
            dataKey="percentage"
            nameKey="category"
          >
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.color}
                opacity={hasData ? 1 : 0.25}
              />
            ))}
          </Pie>
          {hasData && <Tooltip content={<CustomTooltip />} />}
        </PieChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs w-full mt-1">
        {cats.map((entry) => (
          <div key={entry.category} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: entry.color, opacity: hasData ? 1 : 0.3 }}
            />
            <span className="text-zinc-400 truncate">
              {entry.emoji} {entry.category}
            </span>
            <span className="text-zinc-300 ml-auto font-mono">
              {hasData ? `${entry.percentage}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
