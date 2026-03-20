"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState, useEffect } from "react";
import type { TimePressureStats } from "@/types";
import { useTranslation } from "@/shared/lib/i18n";

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

const PHASE_KEYS: Record<string, string> = {
  opening: "chart.opening",
  middlegame: "chart.middlegame",
  endgame: "chart.endgame",
};

interface Props {
  data?: TimePressureStats;
}

function pressureTone(pct: number, t: any) {
  if (pct >= 40) {
    return {
      label: t("chart.highRisk"),
      text: "text-rose-700",
      badge: "bg-rose-100 text-rose-700 border-rose-200",
      bar: "from-rose-500 to-rose-600",
      dot: "bg-rose-500",
    };
  }
  if (pct >= 20) {
    return {
      label: t("chart.warning"),
      text: "text-amber-700",
      badge: "bg-amber-100 text-amber-700 border-amber-200",
      bar: "from-amber-500 to-amber-600",
      dot: "bg-amber-500",
    };
  }
  return {
    label: t("chart.stable"),
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    bar: "from-emerald-500 to-emerald-600",
    dot: "bg-emerald-500",
  };
}

export default function BlunderTimeline({ data }: Props) {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const hasClock = data && data.games_with_clock > 0;
  const isMock = !hasClock;

  // ── 수 번호별 압박 비율 (실제 or 목) ─────────────────────
  const perMove = data?.per_move ?? [];
  const moveData = hasClock
    ? perMove.filter((_, i) => i % 2 === 0 || perMove.length <= 15) // 너무 많으면 격수 표시
    : MOCK_MOVE_DATA;
  const maxAvgThinkTime = Math.max(
    5,
    ...moveData
      .map((d) => (typeof d.avg_time_spent === "number" ? d.avg_time_spent : 0))
      .filter((v) => Number.isFinite(v)),
  );

  // ── 페이즈별 압박 비율 (실제) ─────────────────────────────
  const phaseData = hasClock
    ? data!.by_phase.map((p) => ({
        phase: PHASE_KEYS[p.phase] ? t(PHASE_KEYS[p.phase] as any) : p.phase,
        pressure_pct: Math.round(p.pressure_ratio * 100),
        avg_time: p.avg_time_spent ? Math.round(p.avg_time_spent) : null,
        moves: p.moves,
      }))
    : null;

  const topRiskPhase = phaseData && phaseData.length > 0
    ? [...phaseData].sort((a, b) => b.pressure_pct - a.pressure_pct)[0]
    : null;

  const overall = hasClock ? (data.overall["mine"] ?? Object.values(data.overall)[0]) : null;

  return (
    <div className="space-y-5">
      {isMock && (
        <p className="text-xs text-amber-700/80 text-center">
          {t("chart.mockData")}
        </p>
      )}

      {/* 클록 데이터가 있을 때: 요약 배지 */}
      {hasClock && overall && (
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="bg-chess-bg border border-chess-border rounded-xl px-4 py-3">
            <p className="text-chess-muted">{t("chart.analyzedGames")}</p>
            <p className="mt-1 text-lg font-black text-chess-primary">{t("chart.gamesCount").replace("{n}", String(data!.games_with_clock))}</p>
          </div>
          <div className="bg-chess-bg border border-chess-border rounded-xl px-4 py-3">
            <p className="text-chess-muted">{t("chart.timePressureRate")}</p>
            <p className={`mt-1 text-lg font-black ${overall.pressure_ratio >= 0.3 ? "text-rose-700" : overall.pressure_ratio >= 0.15 ? "text-amber-700" : "text-emerald-700"}`}>
              {Math.round(overall.pressure_ratio * 100)}%
            </p>
          </div>
          <div className="bg-chess-bg border border-chess-border rounded-xl px-4 py-3">
            <p className="text-chess-muted">{t("chart.avgThinkTime")}</p>
            <p className="mt-1 text-lg font-black text-chess-primary">
              {overall.avg_time_spent != null ? t("chart.seconds").replace("{n}", String(overall.avg_time_spent)) : "-"}
            </p>
          </div>
        </div>
      )}

      {/* 페이즈별 + 수 번호별 */}
      <div className={phaseData && phaseData.length > 0 ? "grid gap-4 md:grid-cols-2" : ""}>
        {/* 페이즈별 압박률 카드형 막대 */}
        {phaseData && phaseData.length > 0 && (
          <div className="bg-gradient-to-br from-chess-bg/80 to-chess-bg/30 border border-chess-border rounded-2xl p-4">
            <div className="flex items-end justify-between gap-3 mb-3">
              <p className="text-xs tracking-wide text-chess-muted">{t("chart.phasePressureMap")}</p>
              {topRiskPhase && (
                <p className="text-[11px] text-chess-muted">
                  {t("chart.highestRisk")} <span className="font-bold text-chess-primary">{topRiskPhase.phase}</span>
                </p>
              )}
            </div>

            <div className="space-y-3">
              {phaseData.map((entry) => {
                const tone = pressureTone(entry.pressure_pct, t);
                return (
                  <div key={entry.phase} className="rounded-xl border border-chess-border/80 bg-chess-surface/70 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-chess-primary">{entry.phase}</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-1 rounded-full border ${tone.badge}`}>
                          {tone.label}
                        </span>
                        <span className={`text-sm font-black tabular-nums ${tone.text}`}>
                          {entry.pressure_pct}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 relative h-2.5 w-full rounded-full bg-chess-bg border border-chess-border/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                        style={{ width: `${Math.max(entry.pressure_pct, 4)}%` }}
                      />
                      <span
                        className={`absolute top-1/2 h-2.5 w-2.5 rounded-full border border-white/70 shadow -translate-y-1/2 ${tone.dot}`}
                        style={{ left: `calc(${Math.max(entry.pressure_pct, 4)}% - 6px)` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-chess-muted">
                      <span>{t("chart.sampleMoves").replace("{n}", String(entry.moves))}</span>
                      <span>{entry.avg_time != null ? t("chart.avgThink").replace("{n}", String(entry.avg_time)) : "-"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 수 번호별 압박률 곡선 */}
        <div className="bg-chess-bg/30 border border-chess-border rounded-2xl p-4">
          <p className="text-xs tracking-wide text-chess-muted mb-2">
            {t("chart.pressureByMove")}{isMock ? t("chart.mockSuffix") : ""}
          </p>
          <div className="h-40 sm:h-[245px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={moveData} margin={{ left: -10, right: isMobile ? -10 : 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="pressureGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#C8CBC5" />
                <XAxis
                  dataKey="move_number"
                  tickFormatter={(v) => t("chart.moveN").replace("{n}", String(v))}
                  tick={{ fill: "#5C5755", fontSize: 10 }}
                />
                <YAxis
                  yAxisId="pressure"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "#5C5755", fontSize: 10 }}
                  domain={[0, 100]}
                  width={32}
                />
                <YAxis
                  yAxisId="time"
                  orientation="right"
                  tickFormatter={(v) => `${v}s`}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  domain={[0, Math.ceil(maxAvgThinkTime * 1.25)]}
                  hide={isMobile}
                  width={isMobile ? 0 : 32}
                />
                <Tooltip
                  formatter={(v, name) => [
                    `${v}${name === "pressure_pct" ? "%" : "s"}`,
                    name === "pressure_pct" ? t("chart.pressure") : t("chart.think"),
                  ]}
                  labelFormatter={(v) => t("chart.moveN").replace("{n}", String(v))}
                  contentStyle={{ background: "#FBFBF2", border: "1px solid #C8CBC5", borderRadius: 8, fontSize: 12 }}
                />
                <Area
                  yAxisId="pressure"
                  type="monotone"
                  dataKey="pressure_pct"
                  stroke="#ea580c"
                  strokeWidth={2.5}
                  fill="url(#pressureGrad)"
                  dot={{ r: 2, strokeWidth: 0, fill: "#ea580c" }}
                  activeDot={{ r: 4, fill: "#b91c1c", stroke: "#fff", strokeWidth: 1 }}
                />
                {!isMobile && (
                  <Line
                    yAxisId="time"
                    type="monotone"
                    dataKey="avg_time_spent"
                    connectNulls
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 2, strokeWidth: 0, fill: "#2563eb" }}
                    activeDot={{ r: 4, fill: "#1d4ed8", stroke: "#fff", strokeWidth: 1 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-chess-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-600" /> {t("chart.pressureRatePct")}
            </span>
            {!isMobile && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-600" /> {t("chart.avgThinkSec")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
