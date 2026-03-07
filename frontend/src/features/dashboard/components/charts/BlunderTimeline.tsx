"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { TimePressureStats } from "@/types";

// ── 목 데이터 (게임-클록 데이터 없을 때 표시용) ─────────────
const MOCK_MOVE_DATA = [
  { move_number: 5, pressure_pct: 2, avg_time_spent: 8 },
  { move_number: 10, pressure_pct: 4, avg_time_spent: 7 },
  { move_number: 15, pressure_pct: 7, avg_time_spent: 6 },
  { move_number: 20, pressure_pct: 12, avg_time_spent: 5 },
  { move_number: 25, pressure_pct: 18, avg_time_spent: 4 },
  { move_number: 30, pressure_pct: 28, avg_time_spent: 3 },
  { move_number: 35, pressure_pct: 40, avg_time_spent: 2 },
  { move_number: 40, pressure_pct: 55, avg_time_spent: 1.5 },
];

const PHASE_LABELS: Record<string, string> = {
  opening: "오프닝",
  middlegame: "미들게임",
  endgame: "엔드게임",
};

interface Props {
  data?: TimePressureStats;
}

export default function BlunderTimeline({ data }: Props) {
  const hasClock = data && data.games_with_clock > 0;
  const isMock = !hasClock;

  // ── 수 번호별 압박 비율 (실제 or 목) ─────────────────────
  const perMove = data?.per_move ?? [];
  const moveData = hasClock
    ? perMove.filter((_, i) => i % 2 === 0 || perMove.length <= 15) // 너무 많으면 격수 표시
    : MOCK_MOVE_DATA;

  // ── 페이즈별 압박 비율 (실제) ─────────────────────────────
  const phaseData = hasClock
    ? data.by_phase.map((p) => ({
        phase: PHASE_LABELS[p.phase] ?? p.phase,
        pressure_pct: Math.round(p.pressure_ratio * 100),
        avg_time: p.avg_time_spent ? Math.round(p.avg_time_spent) : null,
        moves: p.moves,
      }))
    : null;

  const overall = hasClock ? (data.overall["mine"] ?? Object.values(data.overall)[0]) : null;

  return (
    <div className="space-y-4">
      {isMock && (
        <p className="text-xs text-amber-700/80 text-center">
          ⚠️ 클록 데이터 없음 — 예시 곡선
        </p>
      )}

      {/* 클록 데이터가 있을 때: 요약 배지 */}
      {hasClock && overall && (
        <div className="flex gap-3 flex-wrap text-xs">
          <div className="bg-chess-bg border border-chess-border rounded-lg px-3 py-2">
            <span className="text-chess-muted">분석 게임</span>
            <span className="ml-2 font-bold text-chess-primary">{data.games_with_clock}게임</span>
          </div>
          <div className="bg-chess-bg border border-chess-border rounded-lg px-3 py-2">
            <span className="text-chess-muted">시간 압박 비율</span>
            <span className={`ml-2 font-bold ${overall.pressure_ratio >= 0.3 ? "text-red-700" : overall.pressure_ratio >= 0.15 ? "text-amber-700" : "text-emerald-700"}`}>
              {Math.round(overall.pressure_ratio * 100)}%
            </span>
          </div>
          {overall.avg_time_spent != null && (
            <div className="bg-chess-bg border border-chess-border rounded-lg px-3 py-2">
              <span className="text-chess-muted">평균 사고 시간</span>
              <span className="ml-2 font-bold text-chess-primary">{overall.avg_time_spent}초</span>
            </div>
          )}
        </div>
      )}

      {/* 페이즈별 + 수 번호별 나란히 시스터 */}
      <div className={phaseData && phaseData.length > 0 ? "grid grid-cols-2 gap-4" : ""}>
        {/* 페이즈별 압박률 막대 */}
        {phaseData && phaseData.length > 0 && (
          <div>
            <p className="text-xs text-chess-muted mb-2">페이즈별 시간 압박 비율</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={phaseData} margin={{ left: -15, right: 4, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#C8CBC5" />
                <XAxis dataKey="phase" tick={{ fill: "#5C5755", fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: "#5C5755", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(v) => [`${v}%`, "시간압박"]}
                  contentStyle={{ background: "#FBFBF2", border: "1px solid #C8CBC5", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="pressure_pct" radius={[4, 4, 0, 0]}>
                  {phaseData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.pressure_pct >= 40 ? "#ef4444" : entry.pressure_pct >= 20 ? "#f59e0b" : "#22c55e"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 수 번호별 압박률 곡선 */}
        <div>
          <p className="text-xs text-chess-muted mb-2">
            수 번호별 시간 압박 비율{isMock ? " (예시)" : ""}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={moveData} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="pressureGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#C8CBC5" />
              <XAxis
                dataKey="move_number"
                tickFormatter={(v) => `${v}수`}
                tick={{ fill: "#5C5755", fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "#5C5755", fontSize: 11 }}
                domain={[0, 100]}
              />
              <Tooltip
                formatter={(v, name) => [
                  `${v}${name === "pressure_pct" ? "%" : "초"}`,
                  name === "pressure_pct" ? "시간압박" : "평균사고",
                ]}
                labelFormatter={(v) => `${v}수`}
                contentStyle={{ background: "#FBFBF2", border: "1px solid #C8CBC5", borderRadius: 8, fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="pressure_pct"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#pressureGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
