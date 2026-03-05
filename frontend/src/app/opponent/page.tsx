"use client";

import { useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOpponentAnalysis } from "@/lib/api";
import type { Platform, TimeClass } from "@/types";
import OpeningsChart from "@/features/dashboard/components/charts/OpeningsChart";
import StatCard from "@/shared/components/ui/StatCard";

function OpponentContent() {
  const [platform, setPlatform] = useState<Platform>("chess.com");
  const [username, setUsername] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [timeClass, setTimeClass] = useState<TimeClass>("blitz");

  const { data, isLoading, error } = useQuery({
    queryKey: ["opponent", platform, submitted, timeClass],
    queryFn: () => getOpponentAnalysis(platform, submitted, timeClass),
    enabled: !!submitted,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) setSubmitted(username.trim());
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-chess-primary mb-1">🎯 상대 분석</h1>
        <p className="text-chess-muted text-sm">
          대회 상대의 유저명을 입력하면 오프닝 패턴과 약점을 분석합니다.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
          {(["chess.com", "lichess"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                platform === p ? "bg-chess-accent text-white" : "bg-chess-surface text-chess-muted"
              }`}
            >
              {p === "chess.com" ? "Chess.com" : "Lichess"}
            </button>
          ))}
        </div>
        <select
          value={timeClass}
          onChange={(e) => setTimeClass(e.target.value as TimeClass)}
          className="bg-chess-surface border border-chess-border rounded-lg px-3 py-2 text-chess-primary text-sm"
        >
          <option value="blitz">Blitz</option>
          <option value="rapid">Rapid</option>
          <option value="bullet">Bullet</option>
        </select>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="상대 유저명"
          className="flex-1 bg-chess-surface border border-chess-border rounded-lg px-4 py-2 text-chess-primary placeholder-chess-muted focus:outline-none focus:border-chess-accent"
        />
        <button
          type="submit"
          className="bg-chess-accent hover:bg-chess-accent/80 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          분석
        </button>
      </form>

      {isLoading && (
        <p className="text-chess-muted animate-pulse text-center py-10">분석 중...</p>
      )}
      {error && (
        <p className="text-red-400 text-sm">오류가 발생했습니다. 유저명을 확인해주세요.</p>
      )}

      {data && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="분석 게임" value={data.total_games_analyzed} />
            <StatCard label="승률" value={`${data.win_rate}%`} color="emerald" />
            <StatCard label="패율" value={`${data.loss_rate}%`} color="red" />
            <StatCard label="타입" value={timeClass} />
          </div>

          {/* Frequent Openings */}
          {data.frequent_openings.length > 0 && (
            <div className="bg-chess-surface border border-chess-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-chess-primary mb-1">자주 사용하는 오프닝</h2>
              <p className="text-chess-muted text-sm mb-4">
                이 오프닝에 대한 준비를 강화하세요
              </p>
              <OpeningsChart data={data.frequent_openings.slice(0, 8)} />
            </div>
          )}

          {/* Openings Table */}
          <div className="bg-chess-surface border border-chess-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-chess-border">
                <tr className="text-chess-muted text-xs uppercase">
                  <th className="text-left px-4 py-3">오프닝</th>
                  <th className="text-right px-4 py-3">게임</th>
                  <th className="text-right px-4 py-3">승률</th>
                </tr>
              </thead>
              <tbody>
                {data.frequent_openings.map((op) => (
                  <tr key={op.eco} className="border-b border-chess-border/50 hover:bg-chess-border/20">
                    <td className="px-4 py-3">
                      <span className="text-chess-muted mr-2">{op.eco}</span>
                      <span className="text-chess-primary truncate">{op.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-chess-muted">{op.games}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${
                      op.win_rate >= 55 ? "text-emerald-400" : op.win_rate >= 45 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {op.win_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OpponentPage() {
  return (
    <Suspense>
      <OpponentContent />
    </Suspense>
  );
}
