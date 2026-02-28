"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getPlayerProfile,
  getFirstMoveStats,
  getOpeningTree,
  getBestWorstOpenings,
  getTimePressure,
  getMoveQuality,
} from "@/lib/api";
import type { Platform, TimeClass } from "@/types";
import { Suspense, useState, useEffect, useMemo } from "react";
import FirstMoveBar from "@/components/charts/FirstMoveBar";
import OpeningTreeTable from "@/components/charts/OpeningTreeTable";
import BestWorstCard from "@/components/charts/BestWorstCard";
import BlunderTimeline from "@/components/charts/BlunderTimeline";
import MoveQualityDonut from "@/components/charts/MoveQualityDonut";
import SectionHeader from "@/components/ui/SectionHeader";
import {
  FirstMovesSkeleton,
  OpeningTreeSkeleton,
  BestWorstSkeleton,
  TimelineSkeleton,
  DonutSkeleton,
} from "@/components/ui/SkeletonCard";

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

type Period = "1w" | "1m" | "3m" | "6m" | "1y" | "custom";
const PERIOD_OPTIONS: { label: string; value: Period; days?: number }[] = [
  { label: "1주", value: "1w", days: 7 },
  { label: "1개월", value: "1m", days: 30 },
  { label: "3개월", value: "3m", days: 90 },
  { label: "6개월", value: "6m", days: 180 },
  { label: "1년", value: "1y", days: 365 },
  { label: "직접 설정", value: "custom" },
];

function DashboardContent() {
  const params = useSearchParams();
  const router = useRouter();
  const initUsername = params.get("username") || "";
  const initPlatform = (params.get("platform") || "chess.com") as Platform;

  const [username, setUsername] = useState(initUsername);
  const [platform, setPlatform] = useState<Platform>(initPlatform);
  const [timeClass, setTimeClass] = useState<TimeClass>("blitz");
  const [submitted, setSubmitted] = useState(initUsername);
  const [submittedPlatform, setSubmittedPlatform] = useState<Platform>(initPlatform);
  const [period, setPeriod] = useState<Period>("3m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const sinceMs = useMemo(() => {
    if (period === "custom") return customFrom ? new Date(customFrom).getTime() : undefined;
    const opt = PERIOD_OPTIONS.find(p => p.value === period);
    return opt?.days ? Date.now() - opt.days * 86_400_000 : undefined;
  }, [period, customFrom]);

  const untilMs = useMemo(() => {
    if (period === "custom" && customTo) return new Date(customTo).getTime();
    return undefined;
  }, [period, customTo]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setSubmitted(username.trim());
    setSubmittedPlatform(platform);
    router.replace(`/dashboard?platform=${platform}&username=${username.trim()}`);
  };

  const enabled = !!submitted;

  const { data: profile } = useQuery({
    queryKey: ["profile", submittedPlatform, submitted],
    queryFn: () => getPlayerProfile(submittedPlatform, submitted),
    enabled,
  });

  // 프로필이 로드되면 플레이어가 가장 많이 플레이한 타임클래스로 자동 전환
  useEffect(() => {
    if (profile?.preferred_time_class) {
      setTimeClass(profile.preferred_time_class as TimeClass);
    }
  }, [profile?.preferred_time_class]);

  const { data: firstMoves, isLoading: loadingFirst } = useQuery({
    queryKey: ["first-moves", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getFirstMoveStats(submittedPlatform, submitted, timeClass, sinceMs, untilMs),
    enabled,
  });
  const { data: openingTree, isLoading: loadingTree } = useQuery({
    queryKey: ["opening-tree", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getOpeningTree(submittedPlatform, submitted, timeClass, sinceMs, untilMs),
    enabled,
  });
  const { data: bestWorst, isLoading: loadingBW } = useQuery({
    queryKey: ["best-worst", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getBestWorstOpenings(submittedPlatform, submitted, timeClass, sinceMs, untilMs),
    enabled,
  });
  const { data: timePressure, isLoading: loadingTP } = useQuery({
    queryKey: ["time-pressure", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getTimePressure(submittedPlatform, submitted, timeClass, 100, sinceMs, untilMs),
    enabled,
    staleTime: 120_000,
  });

  // Step 6: Stockfish 수 품질 분석 (시간이 오래 걸리므로 별도 staleTime)
  const { data: moveQuality, isLoading: loadingMQ } = useQuery({
    queryKey: ["move-quality", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getMoveQuality(submittedPlatform, submitted, timeClass, 5),
    enabled,
    staleTime: 300_000,
    retry: 1,
  });

  const isLoading = loadingFirst || loadingTree || loadingBW || loadingTP;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ── Search Bar (Section 0) ── */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap gap-3 items-center bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4"
      >
        <div className="flex rounded-lg overflow-hidden border border-zinc-700 shrink-0">
          {(["chess.com", "lichess"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                platform === p
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-white"
              }`}
            >
              {p === "chess.com" ? "Chess.com" : "Lichess"}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-zinc-700 shrink-0">
          {TIME_CLASSES.map((tc) => (
            <button
              key={tc}
              type="button"
              onClick={() => setTimeClass(tc)}
              className={`px-3 py-2 text-sm capitalize transition-colors ${
                timeClass === tc
                  ? "bg-zinc-600 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-white"
              }`}
            >
              {tc}
            </button>
          ))}
        </div>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="유저명 입력 (예: MagnusCarlsen)"
          className="flex-1 min-w-48 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
        />
        <button
          type="submit"
          className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-6 py-2 rounded-lg transition-colors shrink-0"
        >
          분석 시작 →
        </button>
      </form>

      {/* ── 기간 탭 ── */}
      {submitted && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-zinc-800 shrink-0">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === opt.value
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-emerald-500"
              />
              <span>~</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}
        </div>
      )}

      {!submitted && (
        <div className="flex flex-col items-center py-24 gap-3 text-zinc-600">
          <span className="text-5xl select-none">♟️</span>
          <p className="text-sm">유저명을 입력하고 분석을 시작하세요.</p>
        </div>
      )}

      {submitted && (
        <>
          {/* Profile Header */}
          {profile && (
            <div className="flex items-center gap-4 px-1 animate-fade-in">
              {profile.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={submitted}
                  className="w-12 h-12 rounded-full border-2 border-zinc-700"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white truncate">{submitted}</h2>
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full capitalize">
                    {submittedPlatform}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-zinc-400 mt-1">
                  {profile.rating_bullet != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-yellow-500">&#9889;</span>
                      <span className="text-zinc-500">Bullet</span>
                      <span className="text-white font-semibold">{profile.rating_bullet}</span>
                    </span>
                  )}
                  {profile.rating_blitz != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-orange-400">⚡</span>
                      <span className="text-zinc-500">Blitz</span>
                      <span className="text-white font-semibold">{profile.rating_blitz}</span>
                    </span>
                  )}
                  {profile.rating_rapid != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-blue-400">⏱</span>
                      <span className="text-zinc-500">Rapid</span>
                      <span className="text-white font-semibold">{profile.rating_rapid}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-16 text-zinc-400 animate-pulse">
              데이터 불러오는 중...
            </div>
          )}

          {!isLoading && (
            <div className="space-y-4 animate-fade-in">
              {/* ── Section 1 ── */}
              <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <SectionHeader title="백 / 흑 첫 수 선호도 및 승률" desc="가장 많이 사용한 오프닝 계열과 결과 분포" />
                {loadingFirst ? (
                  <FirstMovesSkeleton />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FirstMoveBar data={firstMoves?.white ?? []} side="white" />
                    <FirstMoveBar data={firstMoves?.black ?? []} side="black" />
                  </div>
                )}
              </section>

              {/* ── Section 2 ── */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <SectionHeader title="오프닝 트리 탐색기" desc="ECO 카테고리별 게임 수 및 승률 — 클릭하여 전개" />
                  {loadingTree ? <OpeningTreeSkeleton /> : <OpeningTreeTable data={openingTree ?? []} />}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <SectionHeader title="오프닝 퍼포먼스" desc="Best / Worst 오프닝 요약" />
                  {loadingBW ? (
                    <BestWorstSkeleton />
                  ) : bestWorst ? (
                    <BestWorstCard data={bestWorst} />
                  ) : (
                    <p className="text-zinc-500 text-sm">데이터 없음</p>
                  )}
                </div>
              </section>

              {/* ── Section 3 ── */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <SectionHeader title="시간 압박 블런더 비율" desc="남은 시간에 따른 블런더 발생률 추이" />
                  {loadingTP ? <TimelineSkeleton /> : <BlunderTimeline data={timePressure} />}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <SectionHeader title="전반적인 수 품질 비율" desc="Stockfish 분석 — Best · Excellent · Inaccuracy · Mistake · Blunder" />
                  {loadingMQ ? <DonutSkeleton /> : <MoveQualityDonut data={moveQuality} isLoading={false} />}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
