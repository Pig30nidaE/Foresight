"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Step 6(엔진/시간 분석) 연동 전까지 플레이스홀더 곡선
const MOCK_DATA = [
  { time: "10분+", blunder_rate: 3 },
  { time: "8분", blunder_rate: 4 },
  { time: "6분", blunder_rate: 5 },
  { time: "4분", blunder_rate: 8 },
  { time: "2분", blunder_rate: 14 },
  { time: "1분", blunder_rate: 22 },
  { time: "30초", blunder_rate: 35 },
  { time: "10초", blunder_rate: 52 },
];

interface Props {
  data?: typeof MOCK_DATA;
  isMock?: boolean;
}

export default function BlunderTimeline({
  data = MOCK_DATA,
  isMock = true,
}: Props) {
  return (
    <div>
      {isMock && (
        <p className="text-xs text-amber-400/80 mb-3 text-center">
          ⚠️ 엔진 분석 연동 전 예시 데이터
        </p>
      )}
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="blunderGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#71717a", fontSize: 11 }}
            reversed
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#71717a", fontSize: 11 }}
            domain={[0, 60]}
          />
          <Tooltip
            formatter={(v) => [`${v}%`, "블런더 발생률"]}
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="blunder_rate"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#blunderGrad)"
            dot={{ fill: "#ef4444", r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-zinc-600 mt-1">
        ← 시간 여유 있음 &nbsp;|&nbsp; 시간 부족 →
      </p>
    </div>
  );
}
