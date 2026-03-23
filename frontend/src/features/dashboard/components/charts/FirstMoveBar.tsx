"use client";

import { useState, useEffect, useMemo } from "react";
import type { FirstMoveEntry } from "@/types";
import { useTranslation } from "@/shared/lib/i18n";
import {
  usePrefersReducedMotion as usePrefersReducedMotionFromHook,
  readPrefersReducedMotion,
} from "@/hooks/usePrefersReducedMotion";

interface Props {
  data: FirstMoveEntry[];
  side: "white" | "black";
}

function winRateDisplayClass(wr: number) {
  return wr >= 50 ? "text-chess-win" : "text-chess-loss";
}

/** 스택 세그먼트: 동일 인셋 하이라이트로 면이 한 평면에 놓인 느낌 */
const segmentSurface =
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(0,0,0,0.38)]";

const BAR_EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
const SEG_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function StackedSegment({
  flexWeight,
  tone,
  rowDelayMs,
  segIndex,
  drawBars,
  reducedMotion,
  title,
}: {
  flexWeight: number;
  tone: "win" | "draw" | "loss";
  rowDelayMs: number;
  segIndex: number;
  drawBars: boolean;
  reducedMotion: boolean;
  title: string;
}) {
  if (flexWeight <= 0) return null;

  const bg =
    tone === "win"
      ? "bg-fm-bar-win"
      : tone === "draw"
        ? "bg-fm-bar-draw"
        : "bg-fm-bar-loss";

  const segDelay = reducedMotion ? 0 : rowDelayMs + 140 + segIndex * 72;

  return (
    <div
      className="h-full min-w-0 overflow-hidden"
      style={{ flex: `${flexWeight} 1 0%` }}
      title={title}
    >
      <div
        className={`h-full w-full ${bg} ${segmentSurface}`}
        style={{
          transformOrigin: "left center",
          transform: drawBars || reducedMotion ? "scaleX(1)" : "scaleX(0)",
          transition: reducedMotion
            ? "none"
            : `transform 0.52s ${SEG_EASE} ${segDelay}ms`,
        }}
      />
    </div>
  );
}

export default function FirstMoveBar({ data, side }: Props) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotionFromHook();
  const [drawBars, setDrawBars] = useState(readPrefersReducedMotion);

  const sorted = useMemo(
    () => [...data].sort((a, b) => b.games - a.games).slice(0, 8),
    [data],
  );
  const dataKey = useMemo(() => sorted.map((e) => `${e.eco}:${e.games}`).join("|"), [sorted]);

  useEffect(() => {
    if (reducedMotion) {
      setDrawBars(true);
      return;
    }
    setDrawBars(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawBars(true));
    });
    return () => cancelAnimationFrame(id);
  }, [dataKey, side, reducedMotion]);

  if (!data.length) {
    return (
      <p className="text-chess-muted text-sm py-4 text-center">{t("chart.notEnoughFirstMoveData")}</p>
    );
  }

  const sideTitleKey = side === "white" ? "chart.white" : "chart.black";

  return (
    <div className="rounded-xl border border-chess-border/60 dark:border-chess-border/45 bg-chess-bg/80 dark:bg-chess-elevated/12 overflow-hidden shadow-sm">
      <div className="flex flex-col gap-3 border-b border-chess-border/50 dark:border-chess-border/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-chess-muted">
            {t("chart.firstMoveChartTitle")}
          </p>
          <p className="text-sm font-semibold text-chess-primary mt-0.5">{t(sideTitleKey)}</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[10px] font-medium text-chess-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[1px] bg-fm-bar-win shadow-sm" aria-hidden />
            {t("chart.win")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[1px] bg-fm-bar-draw shadow-sm" aria-hidden />
            {t("chart.draw")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[1px] bg-fm-bar-loss shadow-sm" aria-hidden />
            {t("chart.loss")}
          </span>
        </div>
      </div>

      <div className="hidden md:grid md:grid-cols-[minmax(10rem,13rem)_1fr_minmax(4.75rem,5.25rem)] md:gap-4 md:items-end border-b border-chess-border/40 dark:border-chess-border/30 bg-chess-surface/30 dark:bg-chess-bg/20 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-chess-muted">
          {t("chart.opening")}
        </span>
        <div>
          <div className="mb-1 flex justify-between px-0.5 text-[9px] font-medium tabular-nums text-chess-muted/70 select-none">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-chess-muted">
            {t("chart.shareVsMax")}
          </span>
        </div>
        <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-chess-muted">
          {t("chart.winRateColumn")}
        </span>
      </div>

      <div className="divide-y divide-chess-border/40 dark:divide-chess-border/25">
        {sorted.map((entry, index) => {
          const wPct = entry.games > 0 ? (entry.wins / entry.games) * 100 : 0;
          const dPct = entry.games > 0 ? (entry.draws / entry.games) * 100 : 0;
          const lPct = entry.games > 0 ? (entry.losses / entry.games) * 100 : 0;
          const rowDelayMs = index * 44;
          const barDurationMs = reducedMotion ? 0 : 720;
          const barDelayMs = reducedMotion ? 0 : rowDelayMs + 56;

          return (
            <div
              key={entry.eco}
              className={`px-4 py-3 md:grid md:grid-cols-[minmax(10rem,13rem)_1fr_minmax(4.75rem,5.25rem)] md:gap-4 md:items-center md:py-2.5 animate-fm-chart-row`}
              style={reducedMotion ? undefined : { animationDelay: `${rowDelayMs}ms` }}
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-semibold tabular-nums text-chess-muted">
                    {entry.eco}
                  </span>
                  <span className="truncate text-sm font-medium leading-snug text-chess-primary">
                    {entry.first_move_category}
                  </span>
                </div>
                <p className="mt-1 text-[11px] tabular-nums text-chess-muted md:hidden">
                  {t("chart.nGames").replace("{n}", String(entry.games))}
                  <span className="mx-1.5 text-chess-border">·</span>
                  <span className={winRateDisplayClass(entry.win_rate)}>
                    {entry.win_rate.toFixed(1)}%
                  </span>
                </p>
              </div>

              <div className="mt-2 md:mt-0">
                <div className="relative h-3 w-full rounded-sm bg-slate-200/65 dark:bg-slate-950/55 ring-1 ring-slate-300/40 dark:ring-white/[0.08]">
                  <div
                    className="pointer-events-none absolute inset-0 z-0 hidden md:grid md:grid-cols-4"
                    aria-hidden
                  >
                    <div className="border-r border-chess-border/30 dark:border-chess-border/20" />
                    <div className="border-r border-chess-border/30 dark:border-chess-border/20" />
                    <div className="border-r border-chess-border/30 dark:border-chess-border/20" />
                    <div />
                  </div>
                  <div
                    className="relative z-[1] flex h-full w-full min-w-0 gap-px overflow-hidden rounded-sm ring-1 ring-chess-border/25 dark:ring-white/[0.06]"
                    style={{
                      width: drawBars ? "100%" : "0%",
                      maxWidth: "100%",
                      transition: reducedMotion
                        ? "none"
                        : `width ${barDurationMs}ms ${BAR_EASE} ${barDelayMs}ms`,
                    }}
                  >
                    <StackedSegment
                      flexWeight={entry.wins}
                      tone="win"
                      rowDelayMs={rowDelayMs}
                      segIndex={0}
                      drawBars={drawBars}
                      reducedMotion={reducedMotion}
                      title={`${t("chart.win")} ${wPct.toFixed(0)}%`}
                    />
                    <StackedSegment
                      flexWeight={entry.draws}
                      tone="draw"
                      rowDelayMs={rowDelayMs}
                      segIndex={1}
                      drawBars={drawBars}
                      reducedMotion={reducedMotion}
                      title={`${t("chart.draw")} ${dPct.toFixed(0)}%`}
                    />
                    <StackedSegment
                      flexWeight={entry.losses}
                      tone="loss"
                      rowDelayMs={rowDelayMs}
                      segIndex={2}
                      drawBars={drawBars}
                      reducedMotion={reducedMotion}
                      title={`${t("chart.loss")} ${lPct.toFixed(0)}%`}
                    />
                  </div>
                </div>
                <div className="mt-1.5 hidden gap-5 text-[10px] tabular-nums md:flex">
                  <span>
                    <span className="font-medium text-chess-muted">W</span>{" "}
                    <span className="font-medium text-fm-bar-win">{entry.wins}</span>
                  </span>
                  <span>
                    <span className="font-medium text-chess-muted">D</span>{" "}
                    <span className="font-medium text-fm-bar-draw">{entry.draws}</span>
                  </span>
                  <span>
                    <span className="font-medium text-chess-muted">L</span>{" "}
                    <span className="font-medium text-fm-bar-loss">{entry.losses}</span>
                  </span>
                </div>
              </div>

              <div className="hidden text-right md:block">
                <p className={`text-sm font-semibold tabular-nums ${winRateDisplayClass(entry.win_rate)}`}>
                  {entry.win_rate.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-[10px] tabular-nums text-chess-muted">
                  {t("chart.sampleN").replace("{n}", String(entry.games))}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
