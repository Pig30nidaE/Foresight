"use client";

import type { BestWorstOpenings } from "@/types";

interface Props {
  data: BestWorstOpenings;
}

const winColor = (r: number) =>
  r >= 55 ? "text-emerald-700" : r >= 45 ? "text-amber-700" : "text-red-700";

export default function BestWorstCard({ data }: Props) {
  return (
    <div className="space-y-3">
      {/* Best */}
      {data.best ? (
        <div className="bg-emerald-700/8 border border-emerald-700/35 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🏆</span>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Best Opening
            </span>
          </div>
          <p className="text-chess-primary font-semibold leading-snug">{data.best.name}</p>
          <p className="text-chess-muted text-xs font-mono mt-0.5">{data.best.eco}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-emerald-700">{data.best.win_rate}%</span>
            <span className="text-chess-muted text-sm">승률 ({data.best.games}게임)</span>
          </div>
        </div>
      ) : (
        <div className="bg-chess-bg border border-chess-border rounded-xl p-4 text-chess-muted text-sm">
          데이터 부족 (최소 5게임 필요)
        </div>
      )}

      {/* Worst */}
      {data.worst ? (
        <div className="bg-red-700/8 border border-red-600/35 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="text-xs font-bold text-red-700 uppercase tracking-wider">
              Worst Opening
            </span>
          </div>
          <p className="text-chess-primary font-semibold leading-snug">{data.worst.name}</p>
          <p className="text-chess-muted text-xs font-mono mt-0.5">{data.worst.eco}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-red-700">{data.worst.win_rate}%</span>
            <span className="text-chess-muted text-sm">승률 ({data.worst.games}게임)</span>
          </div>
          <p className="text-xs text-red-700/70 mt-2">이 오프닝 준비를 강화하거나 회피를 고려하세요</p>
        </div>
      ) : null}
    </div>
  );
}
