"use client";

import {
  Cell,
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// 섹션 3B: 수 품질 도넛 차트
// Step 6(엔진 분석) 연동 전까지 플레이스홀더 데이터 사용
const MOCK_MOVE_QUALITY = [
  { name: "Brilliant ✨", value: 2, color: "#22d3ee" },
  { name: "Best 👑", value: 45, color: "#10b981" },
  { name: "Good ✅", value: 20, color: "#6ee7b7" },
  { name: "Inaccuracy ⚡", value: 15, color: "#f59e0b" },
  { name: "Mistake ❌", value: 10, color: "#f97316" },
  { name: "Blunder 💀", value: 8, color: "#ef4444" },
];

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { color: string } }[];
}) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs">
      <p className="font-bold text-white">{name}</p>
      <p className="text-zinc-300">{value}%</p>
    </div>
  );
};

interface Props {
  data?: typeof MOCK_MOVE_QUALITY;
  isMock?: boolean;
}

export default function MoveQualityDonut({ data = MOCK_MOVE_QUALITY, isMock = true }: Props) {
  return (
    <div className="flex flex-col items-center">
      {isMock && (
        <p className="text-xs text-amber-400/80 mb-2 text-center">
          ⚠️ 엔진 분석 연동 전 예시 데이터
        </p>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs w-full mt-1">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-zinc-400 truncate">{entry.name}</span>
            <span className="text-zinc-300 ml-auto font-mono">{entry.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
