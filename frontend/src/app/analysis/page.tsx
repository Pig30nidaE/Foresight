"use client";

import { useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPerformanceSummary, getOpeningStats } from "@/lib/api";
import type { Platform, TimeClass } from "@/types";
import StatCard from "@/shared/components/ui/StatCard";
import OpeningsChart from "@/features/dashboard/components/charts/OpeningsChart";

function AnalysisContent() {
  const [platform, setPlatform] = useState<Platform>("chess.com");
  const [username, setUsername] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [timeClass, setTimeClass] = useState<TimeClass>("blitz");

  const { data: perf, isLoading } = useQuery({
    queryKey: ["performance", platform, submitted, timeClass],
    queryFn: () => getPerformanceSummary(platform, submitted, timeClass, 200),
    enabled: !!submitted,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) setSubmitted(username.trim());
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-chess-primary mb-1">📊 내 게임 분석</h1>
        <p className="text-chess-muted text-sm">
          본인의 Chess.com 또는 Lichess 계정으로 퍼포먼스를 분석합니다.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <div className="flex rounded-lg overflow-hidden border border-chess-border">
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
          <option value="classical">Classical</option>
        </select>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="내 유저명"
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
        <p className="text-chess-muted animate-pulse text-center py-10">
          최근 게임을 불러오는 중...
        </p>
      )}

      {perf && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="총 게임" value={perf.total_games} />
            <StatCard label="승" value={perf.wins} color="emerald" />
            <StatCard label="패" value={perf.losses} color="red" />
            <StatCard label="승률" value={`${perf.win_rate}%`} highlight />
          </div>

          {/* Charts */}
          {perf.top_openings.length > 0 && (
            <div className="bg-chess-surface border border-chess-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-chess-primary">오프닝 승률 분석</h2>
              <OpeningsChart data={perf.top_openings} />
            </div>
          )}

          {/* Table */}
          <div className="bg-chess-surface border border-chess-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-chess-border">
              <h2 className="font-semibold text-chess-primary">오프닝 상세</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-chess-border">
                <tr className="text-chess-muted text-xs uppercase">
                  <th className="text-left px-4 py-3">오프닝</th>
                  <th className="text-right px-4 py-3">게임</th>
                  <th className="text-right px-4 py-3">승</th>
                  <th className="text-right px-4 py-3">패</th>
                  <th className="text-right px-4 py-3">승률</th>
                </tr>
              </thead>
              <tbody>
                {perf.top_openings.map((op) => (
                  <tr key={op.eco} className="border-b border-chess-border/50 hover:bg-chess-border/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-chess-muted mr-2 font-mono">{op.eco}</span>
                      <span className="text-chess-primary">{op.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-chess-muted">{op.games}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{op.wins}</td>
                    <td className="px-4 py-3 text-right text-red-400">{op.losses}</td>
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

export default function AnalysisPage() {
  return (
    <Suspense>
      <AnalysisContent />
    </Suspense>
  );
}
