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
import { useState, useEffect, useId } from "react";
import type { TimePressureStats } from "@/types";
import { useTranslation } from "@/shared/lib/i18n";
import { PixelWarnGlyph } from "@/shared/components/ui/PixelGlyphs";

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

/** 압박 단계 — chess-win/loss 토큰 + 다크에서도 배지 대비 유지 (민트만 쓰지 않음) */
function pressureTone(pct: number, t: any) {
  if (pct >= 40) {
    return {
      label: t("chart.highRisk"),
      text: "text-chess-loss",
      badge:
        "border border-chess-loss/40 bg-chess-loss/10 text-chess-loss dark:bg-red-950/40 dark:border-chess-loss/35",
      barClass: "bg-red-600",
    };
  }
  if (pct >= 20) {
    return {
      label: t("chart.warning"),
      text: "text-chess-warn",
      badge:
        "border border-amber-600/50 bg-amber-100 text-amber-950 dark:bg-amber-950/35 dark:text-amber-200 dark:border-amber-500/40",
      barClass: "bg-amber-600",
    };
  }
  return {
    label: t("chart.stable"),
    text: "text-chess-win",
    badge:
      "border border-chess-win/45 bg-chess-win/10 text-chess-win dark:bg-chess-win/18 dark:border-chess-win/40",
      barClass: "bg-green-600",
  };
}

export default function BlunderTimeline({ data }: Props) {
  const { t } = useTranslation();
  const areaPatternId = useId().replace(/:/g, "");
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
  const upq = overall?.under_pressure_quality;

  return (
    <div className="space-y-5">
      {isMock && (
        <p className="text-xs text-chess-warn/90 dark:text-chess-warn/80 text-center inline-flex items-center justify-center gap-1.5 w-full flex-wrap">
          <PixelWarnGlyph size={14} className="shrink-0 text-chess-warn" />
          {t("chart.mockData")}
        </p>
      )}

      {/* 클록 데이터가 있을 때: 요약 배지 */}
      {hasClock && overall && (
        <div
          className={`grid gap-3 text-xs ${
            upq ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
          }`}
        >
          <div className="pixel-frame bg-chess-bg px-4 py-3">
            <p className="text-chess-muted">{t("chart.analyzedGames")}</p>
            <p className="mt-1 text-lg font-black text-chess-primary">{t("chart.gamesCount").replace("{n}", String(data!.games_with_clock))}</p>
          </div>
          <div className="pixel-frame bg-chess-bg px-4 py-3">
            <p className="text-chess-muted">{t("chart.timePressureRate")}</p>
            <p className={`mt-1 text-lg font-black ${overall.pressure_ratio >= 0.3 ? "text-chess-loss" : overall.pressure_ratio >= 0.15 ? "text-chess-warn" : "text-chess-win"}`}>
              {Math.round(overall.pressure_ratio * 100)}%
            </p>
          </div>
          <div className="pixel-frame bg-chess-bg px-4 py-3">
            <p className="text-chess-muted">{t("chart.avgThinkTime")}</p>
            <p className="mt-1 text-lg font-black text-chess-primary">
              {overall.avg_time_spent != null ? t("chart.seconds").replace("{n}", String(overall.avg_time_spent)) : "-"}
            </p>
          </div>
          {upq && (
            <div className="pixel-frame bg-chess-bg px-4 py-3">
              <p className="text-chess-muted">{t("chart.pressureSevereUnderPct")}</p>
              <p
                className={`mt-1 text-lg font-black ${
                  upq.severe_under_pressure_ratio >= 0.35
                    ? "text-chess-loss"
                    : upq.severe_under_pressure_ratio >= 0.2
                      ? "text-chess-warn"
                      : "text-chess-win"
                }`}
              >
                {Math.round(upq.severe_under_pressure_ratio * 100)}%
              </p>
              <p className="mt-1 text-[10px] text-chess-muted leading-tight">
                {t("chart.pressureQualityFootnote")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 페이즈별 + 수 번호별 */}
      <div className={phaseData && phaseData.length > 0 ? "grid gap-4 md:grid-cols-2" : ""}>
        {/* 페이즈별 압박률 카드형 막대 */}
        {phaseData && phaseData.length > 0 && (
          <div className="pixel-frame bg-chess-bg/95 dark:bg-chess-elevated/12 p-4.5">
            <div className="flex items-end justify-between gap-3 mb-3">
              <p className="text-sm sm:text-base font-semibold tracking-wide text-chess-primary">{t("chart.phasePressureMap")}</p>
              {topRiskPhase && (
                <p className="text-sm text-chess-muted">
                  {t("chart.highestRisk")}{" "}
                  <span className="font-bold text-chess-primary">{topRiskPhase.phase}</span>
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              {phaseData.map((entry) => {
                const tone = pressureTone(entry.pressure_pct, t);
                return (
                  <div
                    key={entry.phase}
                    className="pixel-frame bg-chess-surface/70 dark:bg-chess-bg/35 px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-base text-chess-primary">{entry.phase}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs sm:text-sm font-semibold px-2.5 py-0.5 border-2 ${tone.badge}`}>
                          {tone.label}
                        </span>
                        <span className={`text-base sm:text-lg font-black tabular-nums ${tone.text}`}>
                          {entry.pressure_pct}%
                        </span>
                      </div>
                    </div>

                    {/* 읽기 전용 막대 (슬라이더 썸 제거) */}
                    <div className="mt-2.5 h-3.5 w-full overflow-hidden bg-chess-elevated dark:bg-chess-surface/50 border border-chess-border/50">
                      <div
                        className={`h-full ${tone.barClass}`}
                        style={{ width: `${Math.max(entry.pressure_pct, 2)}%` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-sm text-chess-muted">
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
        <div className="pixel-frame bg-chess-bg/90 dark:bg-chess-elevated/12 p-4">
          <p className="text-xs tracking-wide text-chess-muted mb-2">
            {t("chart.pressureByMove")}{isMock ? t("chart.mockSuffix") : ""}
          </p>
          <div className="h-40 sm:h-[245px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={moveData} margin={{ left: -10, right: isMobile ? -10 : 8, top: 4, bottom: 0 }}>
                <defs>
                  <pattern id={areaPatternId} width="5" height="5" patternUnits="userSpaceOnUse">
                    <rect width="5" height="5" fill="#ea580c" fillOpacity={0.28} />
                    <rect x="0" y="0" width="2" height="2" fill="#000" opacity={0.14} />
                    <rect x="2" y="2" width="2" height="2" fill="#fff" opacity={0.08} />
                    <rect x="4" y="4" width="1" height="1" fill="#000" opacity={0.2} />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#b9bdb4" strokeWidth={1.5} />
                <XAxis
                  dataKey="move_number"
                  tickFormatter={(v) => t("chart.moveN").replace("{n}", String(v))}
                  tick={{ fill: "#454039", fontSize: 10 }}
                />
                <YAxis
                  yAxisId="pressure"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "#454039", fontSize: 10 }}
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
                  contentStyle={{ background: "#FBFBF2", border: "2px solid #b9bdb4", borderRadius: 2, fontSize: 12 }}
                />
                <Area
                  yAxisId="pressure"
                  type="linear"
                  dataKey="pressure_pct"
                  stroke="#c2410c"
                  strokeWidth={3}
                  fill={`url(#${areaPatternId})`}
                  dot={{ r: 3, strokeWidth: 2, stroke: "#1a1714", fill: "#ea580c" }}
                  activeDot={{ r: 5, fill: "#b91c1c", stroke: "#1a1714", strokeWidth: 2 }}
                />
                {!isMobile && (
                  <Line
                    yAxisId="time"
                    type="linear"
                    dataKey="avg_time_spent"
                    connectNulls
                    stroke="#1d4ed8"
                    strokeWidth={3}
                    dot={{ r: 3, strokeWidth: 2, stroke: "#1a1714", fill: "#3b82f6" }}
                    activeDot={{ r: 5, fill: "#1d4ed8", stroke: "#1a1714", strokeWidth: 2 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-chess-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 border border-chess-primary/30 bg-orange-600" /> {t("chart.pressureRatePct")}
            </span>
            {!isMobile && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 border border-chess-primary/30 bg-blue-600" /> {t("chart.avgThinkSec")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
