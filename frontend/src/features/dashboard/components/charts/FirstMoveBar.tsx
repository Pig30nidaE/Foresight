"use client";

import type { FirstMoveEntry } from "@/types";

interface Props {
  data: FirstMoveEntry[];
  side: "white" | "black";
}

function winRateBadge(wr: number) {
  if (wr >= 55) return { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/40" };
  if (wr >= 45) return { bg: "bg-amber-500/20",   text: "text-amber-400",   border: "border-amber-500/40" };
  return          { bg: "bg-red-500/20",    text: "text-red-400",    border: "border-red-500/40" };
}

const SIDE_LABEL: Record<"white" | "black", string> = {
  white: "백 (White)",
  black: "흑 (Black)",
};

export default function FirstMoveBar({ data, side }: Props) {
  if (!data.length) {
    return (
      <p className="text-zinc-500 text-sm py-4 text-center">데이터가 부족합니다.</p>
    );
  }

  const sorted   = [...data].sort((a, b) => b.games - a.games).slice(0, 8);
  const maxGames = Math.max(...sorted.map((e) => e.games), 1);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-zinc-300 mb-4">{SIDE_LABEL[side]}</div>

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
                <span className="text-sm font-mono font-bold text-emerald-300 shrink-0 w-10">
                  {entry.eco}
                </span>
                <span className="text-sm text-zinc-300 truncate max-w-[200px]">
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
                <span className="text-xs text-zinc-500">{entry.games}국</span>
              </div>
            </div>

            {/* Composite Bar — always full-width proportional */}
            <div className="w-full bg-zinc-800 rounded-full h-7 overflow-hidden">
              <div
                className="h-full rounded-full flex overflow-hidden transition-all duration-300"
                style={{ width: `${widthPct}%` }}
              >
                <div className="bg-emerald-600 h-full" style={{ width: `${wPct}%` }} />
                <div className="bg-zinc-500 h-full" style={{ width: `${dPct}%` }} />
                <div className="bg-red-700 h-full flex-1" />
              </div>
            </div>

            {/* W / D / L */}
            <div className="flex gap-3 mt-1 text-xs text-zinc-500">
              <span className="text-emerald-500 font-medium">{entry.wins}W</span>
              <span className="text-zinc-400">{entry.draws}D</span>
              <span className="text-red-500 font-medium">{entry.losses}L</span>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex gap-5 text-xs text-zinc-500 pt-2 border-t border-zinc-800/60">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" /> 승
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-zinc-500 inline-block" /> 무
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-700 inline-block" /> 패
        </span>
      </div>
    </div>
  );
}
