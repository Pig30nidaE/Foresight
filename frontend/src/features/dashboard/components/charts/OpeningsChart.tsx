"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { OpeningStats } from "@/types";

interface Props {
  data: OpeningStats[];
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: OpeningStats }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-chess-bg border border-chess-border rounded-lg px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold text-chess-primary truncate max-w-48">{d.name}</p>
      <p className="text-chess-muted">{d.eco}</p>
      <p className="text-emerald-700">승률 {d.win_rate}%</p>
      <p className="text-chess-primary/80">{d.games}게임 ({d.wins}승 {d.losses}패 {d.draws}무)</p>
    </div>
  );
};

export default function OpeningsChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          dataKey="eco"
          type="category"
          width={50}
          tick={{ fill: "#5C5755", fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(179,138,88,0.08)" }} />
        <Bar dataKey="win_rate" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.win_rate >= 55 ? "#059669" : entry.win_rate >= 45 ? "#d97706" : "#dc2626"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
