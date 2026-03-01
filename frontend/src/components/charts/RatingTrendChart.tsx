"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { RatingDataPoint } from "@/types";

interface Props {
  data: RatingDataPoint[];
  isLoading?: boolean;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: { dateStr: string } }[];
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs">
      <p className="text-zinc-400">{payload[0].payload.dateStr}</p>
      <p className="text-white font-bold text-sm">{payload[0].value}</p>
    </div>
  );
};

export default function RatingTrendChart({ data, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <div className="h-36 flex items-center justify-center">
        <p className="text-zinc-500 text-sm animate-pulse">레이팅 데이터 로드 중...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-36 flex items-center justify-center">
        <p className="text-zinc-600 text-sm">레이팅 히스토리 데이터 없음</p>
      </div>
    );
  }

  // 날짜 포맷 준비
  const chartData = data.map((d) => ({
    ...d,
    dateStr: new Date(d.date * 1000).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    }),
  }));

  const ratings = data.map((d) => d.rating);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const padding = Math.max(20, Math.round((maxR - minR) * 0.1));

  // delta 계산 (처음 대비 마지막)
  const delta = data.length >= 2 ? data[data.length - 1].rating - data[0].rating : 0;
  const deltaColor = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-zinc-400";
  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

  // 샘플링: 데이터가 너무 많으면 간격 조정
  const sampleRate = data.length > 200 ? Math.ceil(data.length / 150) : 1;
  const sampled = chartData.filter((_, i) => i % sampleRate === 0 || i === chartData.length - 1);

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-2xl font-bold text-white">
          {data[data.length - 1].rating}
        </span>
        {data.length >= 2 && (
          <span className={`text-sm font-semibold ${deltaColor}`}>
            {deltaStr} (기간 중)
          </span>
        )}
        <span className="text-zinc-600 text-xs ml-auto">{data.length}게임 기반</span>
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={sampled} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis
            dataKey="dateStr"
            tick={{ fill: "#71717a", fontSize: 10 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minR - padding, maxR + padding]}
            tick={{ fill: "#71717a", fontSize: 10 }}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* 현재 레이팅 기준선 */}
          <ReferenceLine
            y={data[data.length - 1].rating}
            stroke="#10b98133"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#10b981" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
