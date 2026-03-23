"use client";

import type { FirstMoveEntry } from "@/types";
import { useTranslation } from "@/shared/lib/i18n";

interface Props {
  data: FirstMoveEntry[];
  side: "white" | "black";
}

function winRateBadge(wr: number) {
  if (wr >= 55) return { bg: "bg-emerald-700/10 dark:bg-emerald-500/12", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-700/35 dark:border-emerald-400/30" };
  if (wr >= 45) return { bg: "bg-amber-700/10 dark:bg-amber-500/12", text: "text-amber-800 dark:text-amber-200", border: "border-amber-700/35 dark:border-amber-400/30" };
  return { bg: "bg-red-600/10 dark:bg-red-500/12", text: "text-red-800 dark:text-red-300", border: "border-red-600/35 dark:border-red-400/30" };
}

const SIDE_LABEL: Record<"white" | "black", string> = {
  white: "백 (White)",
  black: "흑 (Black)",
};

export default function FirstMoveBar({ data, side }: Props) {
  const { t } = useTranslation();
  if (!data.length) {
    return (
      <p className="text-chess-muted text-sm py-4 text-center">{t("chart.notEnoughFirstMoveData")}</p>
    );
  }

  const sorted   = [...data].sort((a, b) => b.games - a.games).slice(0, 8);
  const maxGames = Math.max(...sorted.map((e) => e.games), 1);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-chess-primary mb-4">{t(`chart.${side}` as any)}</div>

      {sorted.map((entry) => {
        const widthPct = Math.round((entry.games / maxGames) * 100);
        const wPct     = entry.games > 0 ? (entry.wins   / entry.games) * 100 : 0;
        const dPct     = entry.games > 0 ? (entry.draws  / entry.games) * 100 : 0;
        const badge    = winRateBadge(entry.win_rate);

        return (
          <div key={entry.eco} className="mb-3">
            {/* Label row */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-mono font-bold text-chess-accent shrink-0 w-10">
                  {entry.eco}
                </span>
                <span className="text-sm text-chess-primary truncate max-w-[200px]">
                  {entry.first_move_category}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border
                    ${badge.bg} ${badge.text} ${badge.border}`}
                >
                  {entry.win_rate.toFixed(1)}%
                </span>
                <span className="text-xs text-chess-muted">{t("chart.nGames").replace("{n}", String(entry.games))}</span>
              </div>
            </div>

            {/* Composite Bar — always full-width proportional */}
            <div className="w-full bg-chess-border/50 dark:bg-chess-bg/80 rounded-full h-7 overflow-hidden ring-1 ring-chess-border/30 dark:ring-white/5">
              <div
                className="h-full rounded-full flex overflow-hidden transition-all duration-300"
                style={{ width: `${widthPct}%` }}
              >
                <div className="bg-emerald-600 dark:bg-emerald-500/85 h-full" style={{ width: `${wPct}%` }} />
                <div className="bg-chess-muted dark:bg-slate-500/70 h-full" style={{ width: `${dPct}%` }} />
                <div className="bg-red-700 dark:bg-red-500/80 h-full flex-1" />
              </div>
            </div>

            {/* W / D / L */}
            <div className="flex gap-3 mt-1 text-xs text-chess-muted">
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">{entry.wins}W</span>
              <span className="text-chess-muted">{entry.draws}D</span>
              <span className="text-red-700 dark:text-red-400 font-medium">{entry.losses}L</span>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex gap-5 text-xs text-chess-muted pt-2 border-t border-chess-border/70">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-600 dark:bg-emerald-500 inline-block" /> {t("chart.win")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-chess-muted inline-block" /> {t("chart.draw")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-700 inline-block" /> {t("chart.loss")}
        </span>
      </div>
    </div>
  );
}
