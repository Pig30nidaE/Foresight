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
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
      <p className="font-semibold text-white truncate max-w-48">{d.name}</p>
      <p className="text-zinc-400">{d.eco}</p>
      <p className="text-emerald-400">승률 {d.win_rate}%</p>
      <p className="text-zinc-300">{d.games}게임 ({d.wins}승 {d.losses}패 {d.draws}무)</p>
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
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="win_rate" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.win_rate >= 55 ? "#10b981" : entry.win_rate >= 45 ? "#f59e0b" : "#ef4444"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
