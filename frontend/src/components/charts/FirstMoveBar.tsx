"use client";

import type { FirstMoveEntry } from "@/types";
import clsx from "clsx";

interface Props {
  data: FirstMoveEntry[];
  side: "white" | "black";
}

const SIDE_LABEL: Record<"white" | "black", string> = {
  white: "백(White)으로",
  black: "흑(Black)으로",
};

export default function FirstMoveBar({ data, side }: Props) {
  if (!data.length) {
    return (
      <p className="text-zinc-500 text-sm py-3">데이터가 부족합니다.</p>
    );
  }

  const maxGames = Math.max(...data.map((d) => d.games));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-400">
        {SIDE_LABEL[side]} 사용한 오프닝 계열 (ECO)
      </h3>
      {data.map((entry) => {
        const widthWin = entry.games ? (entry.wins / entry.games) * 100 : 0;
        const widthDraw = entry.games ? (entry.draws / entry.games) * 100 : 0;
        const widthLoss = entry.games ? (entry.losses / entry.games) * 100 : 0;
        const barWidth = Math.round((entry.games / maxGames) * 100);

        return (
          <div key={entry.eco} className="space-y-1">
            {/* Label Row */}
            <div className="flex items-center justify-between text-xs">
              <span className="flex gap-2 items-center">
                <span className="font-mono font-bold text-zinc-300 w-8">
                  {entry.eco}
                </span>
                <span className="text-zinc-500">{entry.first_move_category}</span>
              </span>
              <span className="text-zinc-400">
                {entry.games}게임 &nbsp;
                <span className="text-emerald-400">{entry.wins}승</span>
                <span className="text-zinc-600"> · </span>
                <span className="text-zinc-400">{entry.draws}무</span>
                <span className="text-zinc-600"> · </span>
                <span className="text-red-400">{entry.losses}패</span>
              </span>
            </div>

            {/* Composite Bar */}
            <div
              className="h-5 rounded overflow-hidden bg-zinc-800 relative"
              style={{ width: `${Math.max(barWidth, 20)}%` }}
            >
              <div className="flex h-full w-full">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${widthWin}%` }}
                  title={`승: ${entry.wins}`}
                />
                <div
                  className="bg-zinc-500 h-full transition-all"
                  style={{ width: `${widthDraw}%` }}
                  title={`무: ${entry.draws}`}
                />
                <div
                  className="bg-red-500 h-full transition-all"
                  style={{ width: `${widthLoss}%` }}
                  title={`패: ${entry.losses}`}
                />
              </div>
              {/* Win rate label */}
              <span className="absolute right-2 top-0 bottom-0 flex items-center text-[10px] font-bold text-white">
                {entry.win_rate}%
              </span>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-zinc-500 pt-1">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> 승
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-zinc-500 inline-block" /> 무
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> 패
        </span>
      </div>
    </div>
  );
}
