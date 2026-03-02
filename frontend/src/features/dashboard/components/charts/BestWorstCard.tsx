"use client";

import type { BestWorstOpenings } from "@/types";

interface Props {
  data: BestWorstOpenings;
}

const winColor = (r: number) =>
  r >= 55 ? "text-emerald-400" : r >= 45 ? "text-amber-400" : "text-red-400";

export default function BestWorstCard({ data }: Props) {
  return (
    <div className="space-y-3">
      {/* Best */}
      {data.best ? (
        <div className="bg-emerald-950/40 border border-emerald-700/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🏆</span>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Best Opening
            </span>
          </div>
          <p className="text-white font-semibold leading-snug">{data.best.name}</p>
          <p className="text-zinc-500 text-xs font-mono mt-0.5">{data.best.eco}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-emerald-400">{data.best.win_rate}%</span>
            <span className="text-zinc-500 text-sm">승률 ({data.best.games}게임)</span>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-500 text-sm">
          데이터 부족 (최소 5게임 필요)
        </div>
      )}

      {/* Worst */}
      {data.worst ? (
        <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
              Worst Opening
            </span>
          </div>
          <p className="text-white font-semibold leading-snug">{data.worst.name}</p>
          <p className="text-zinc-500 text-xs font-mono mt-0.5">{data.worst.eco}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-red-400">{data.worst.win_rate}%</span>
            <span className="text-zinc-500 text-sm">승률 ({data.worst.games}게임)</span>
          </div>
          <p className="text-xs text-red-300/70 mt-2">이 오프닝 준비를 강화하거나 회피를 고려하세요</p>
        </div>
      ) : null}
    </div>
  );
}
