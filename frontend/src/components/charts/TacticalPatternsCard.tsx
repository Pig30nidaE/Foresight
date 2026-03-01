"use client";

import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";
import type { TacticalAnalysis, TacticalPattern } from "@/types";

interface Props {
  data?: TacticalAnalysis;
  isLoading?: boolean;
}

const CATEGORY_COLOR: Record<string, string> = {
  time: "text-amber-400",
  position: "text-blue-400",
  opening: "text-emerald-400",
  endgame: "text-purple-400",
  balance: "text-zinc-300",
};

const CATEGORY_BG: Record<string, string> = {
  time: "bg-amber-400/10 border-amber-400/30",
  position: "bg-blue-400/10 border-blue-400/30",
  opening: "bg-emerald-400/10 border-emerald-400/30",
  endgame: "bg-purple-400/10 border-purple-400/30",
  balance: "bg-zinc-700/30 border-zinc-600/30",
};

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 65 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${
        score >= 65 ? "text-emerald-400" : score >= 45 ? "text-amber-400" : "text-red-400"
      }`}>
        {score}
      </span>
    </div>
  );
}

function PatternCard({ p, highlight }: { p: TacticalPattern; highlight: "strength" | "weakness" | null }) {
  const catColor = CATEGORY_COLOR[p.category] ?? "text-zinc-400";
  const catBg = CATEGORY_BG[p.category] ?? "bg-zinc-800 border-zinc-700";
  const border =
    highlight === "strength"
      ? "border-emerald-600/60 bg-emerald-950/20"
      : highlight === "weakness"
      ? "border-red-700/50 bg-red-950/20"
      : "border-zinc-800 bg-zinc-900/40";

  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base leading-none">{p.icon}</span>
          <span className="text-sm font-semibold text-zinc-200 truncate">{p.label}</span>
          {highlight === "strength" && (
            <span className="text-xs text-emerald-400 font-bold shrink-0">★ 강점</span>
          )}
          {highlight === "weakness" && (
            <span className="text-xs text-red-400 font-bold shrink-0">▼ 약점</span>
          )}
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${catBg} ${catColor}`}>
          {p.category}
        </span>
      </div>
      <ScoreBar score={p.score} />
      <p className="text-xs text-zinc-500 leading-snug">{p.description}</p>
      <p className="text-xs text-zinc-400">{p.detail}</p>
    </div>
  );
}

export default function TacticalPatternsCard({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-800 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data.patterns.length) {
    return (
      <p className="text-zinc-500 text-sm py-8 text-center">
        분석 데이터 부족 — 더 많은 게임이 필요합니다.
      </p>
    );
  }

  // 레이더 차트용 데이터
  const radarData = data.patterns.map((p) => ({
    label: p.label,
    score: p.score,
  }));

  // 강점/약점 집합 (label 기준)
  const strengthSet = new Set(data.strengths.map((p) => p.label));
  const weaknessSet = new Set(data.weaknesses.map((p) => p.label));

  return (
    <div className="space-y-5">
      {/* 레이더 차트 */}
      {radarData.length >= 4 && (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
              <PolarGrid stroke="#3f3f46" />
              <PolarAngleAxis
                dataKey="label"
                tick={{ fill: "#a1a1aa", fontSize: 10 }}
              />
              <Radar
                name="점수"
                dataKey="score"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.25}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                formatter={(v: number | undefined) => [`${v ?? "?"}점`, "점수"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 강점 / 약점 요약 배지 */}
      {(data.strengths.length > 0 || data.weaknesses.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {/* 강점 */}
          <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/40 p-3">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-2">
              🏆 상위 강점
            </p>
            {data.strengths.map((p) => (
              <div key={p.label} className="flex items-center gap-1.5 py-0.5">
                <span className="text-sm">{p.icon}</span>
                <span className="text-zinc-200 text-xs font-medium">{p.label}</span>
                <span className="ml-auto text-emerald-400 text-xs font-bold">{p.score}</span>
              </div>
            ))}
          </div>
          {/* 약점 */}
          <div className="rounded-xl bg-red-950/20 border border-red-700/40 p-3">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-2">
              ⚠️ 개선 필요
            </p>
            {data.weaknesses.map((p) => (
              <div key={p.label} className="flex items-center gap-1.5 py-0.5">
                <span className="text-sm">{p.icon}</span>
                <span className="text-zinc-200 text-xs font-medium">{p.label}</span>
                <span className="ml-auto text-red-400 text-xs font-bold">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 패턴 리스트 */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-600 uppercase tracking-wider">전체 패턴 ({data.patterns.length})</p>
        {data.patterns.map((p) => (
          <PatternCard
            key={p.label}
            p={p}
            highlight={
              strengthSet.has(p.label) ? "strength"
              : weaknessSet.has(p.label) ? "weakness"
              : null
            }
          />
        ))}
      </div>

      <p className="text-xs text-zinc-600 text-center">
        총 {data.total_games}게임 기반 분석 · MVP.md 기반 10종 전술 패턴
      </p>
    </div>
  );
}
