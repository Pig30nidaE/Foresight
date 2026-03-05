"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getPlayerProfile,
  getFirstMoveStats,
  getOpeningTree,
  getBestWorstOpenings,
  getTimePressure,
  getTacticalPatterns,
} from "@/lib/api";
import type { Platform, TimeClass } from "@/types";
import { Suspense, useState, useEffect, useMemo } from "react";
import FirstMoveBar from "@/features/dashboard/components/charts/FirstMoveBar";
import OpeningTreeTable from "@/features/dashboard/components/charts/OpeningTreeTable";
import BestWorstCard from "@/features/dashboard/components/charts/BestWorstCard";
import BlunderTimeline from "@/features/dashboard/components/charts/BlunderTimeline";
import TacticalPatternsCard from "@/features/dashboard/components/charts/TacticalPatternsCard";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import {
  FirstMovesSkeleton,
  OpeningTreeSkeleton,
  BestWorstSkeleton,
  TimelineSkeleton,
} from "@/shared/components/ui/SkeletonCard";

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

type Period = "1w" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";
const PERIOD_OPTIONS: { label: string; value: Period; days?: number }[] = [
  { label: "1주", value: "1w", days: 7 },
  { label: "1개월", value: "1m", days: 30 },
  { label: "3개월", value: "3m", days: 90 },
  { label: "6개월", value: "6m", days: 180 },
  { label: "1년", value: "1y", days: 365 },
  { label: "전체", value: "all" },
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
  const [pendingFrom, setPendingFrom] = useState("");
  const [pendingTo, setPendingTo] = useState("");
  const [treeViewSide, setTreeViewSide] = useState<"white" | "black">("white");

  const sinceMs = useMemo(() => {
    if (period === "all") return undefined;
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

  const { data: firstMoves, isLoading: loadingFirst, isSuccess: firstMovesLoaded } = useQuery({
    queryKey: ["first-moves", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getFirstMoveStats(submittedPlatform, submitted, timeClass, sinceMs, untilMs),
    enabled,
  });
  const { data: openingTreeWhite, isLoading: loadingTreeW } = useQuery({
    queryKey: ["opening-tree-white", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getOpeningTree(submittedPlatform, submitted, timeClass, sinceMs, untilMs, "white"),
    enabled,
  });
  const { data: openingTreeBlack, isLoading: loadingTreeB } = useQuery({
    queryKey: ["opening-tree-black", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getOpeningTree(submittedPlatform, submitted, timeClass, sinceMs, untilMs, "black"),
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

  // 전술 패턴 분석
  const { data: tacticalPatterns, isLoading: loadingTactical } = useQuery({
    queryKey: ["tactical-patterns", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getTacticalPatterns(submittedPlatform, submitted, timeClass, sinceMs, untilMs),
    enabled,
    staleTime: 180_000,
    retry: 1,
  });

  const isLoading = loadingFirst || loadingTreeW || loadingTreeB || loadingBW || loadingTP;

  const totalGames = useMemo(() => {
    // total_games: 백엔드가 첫수 필터 전 실제 집계한 전체 게임 수
    // (firstMoves.white/black 합산은 첫수 5판 미만 오프닝을 제외해 0이 될 수 있음)
    return firstMoves?.total_games ?? 0;
  }, [firstMoves]);

  // isSuccess: 데이터가 실제 돌아온 경우만 판단 (에러 또는 로딩 중에는 오판 안 함)
  const insufficientData = firstMovesLoaded && submitted !== "" && totalGames < 5;

  const tcGameCount = (tc: TimeClass): number | undefined => {
    if (!profile) return undefined;
    switch (tc) {
      case "bullet": return profile.games_bullet;
      case "blitz": return profile.games_blitz;
      case "rapid": return profile.games_rapid;
      case "classical": return profile.games_classical;
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Search Bar (Section 0) ── */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap gap-3 items-center bg-chess-surface/60 border border-chess-border rounded-2xl p-5"
      >
        <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
          {(["chess.com", "lichess"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                platform === p
                  ? "bg-chess-accent text-white"
                  : "bg-chess-surface text-chess-muted hover:text-chess-primary"
              }`}
            >
              {p === "chess.com" ? "Chess.com" : "Lichess"}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
          {TIME_CLASSES.map((tc) => {
            const count = tcGameCount(tc);
            return (
              <button
                key={tc}
                type="button"
                onClick={() => setTimeClass(tc)}
                className={`px-3 py-2 text-sm capitalize transition-colors ${
                  timeClass === tc
                    ? "bg-chess-primary text-white"
                    : "bg-chess-surface text-chess-muted hover:text-chess-primary"
                }`}
              >
                {tc}
                {count != null && (
                  <span className="ml-1 text-xs opacity-70">({count} Games)</span>
                )}
              </button>
            );
          })}
        </div>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="유저명 입력 (예: MagnusCarlsen)"
          className="flex-1 min-w-48 bg-chess-surface border border-chess-border rounded-lg px-4 py-2 text-chess-primary placeholder-chess-muted focus:outline-none focus:border-chess-accent transition-colors"
        />
        <button
          type="submit"
          className="bg-chess-accent hover:bg-chess-accent/80 text-white font-semibold px-6 py-2 rounded-lg transition-colors shrink-0"
        >
          분석 시작 →
        </button>
      </form>

      {/* ── 기간 탭 ── */}
      {submitted && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === opt.value
                    ? "bg-chess-accent text-white"
                    : "bg-chess-surface text-chess-muted hover:text-chess-primary hover:bg-chess-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-2 text-xs text-chess-muted">
              <input
                type="date"
                value={pendingFrom}
                onChange={(e) => setPendingFrom(e.target.value)}
                className="bg-chess-surface border border-chess-border rounded-md px-2 py-1.5 text-chess-primary focus:outline-none focus:border-chess-accent"
              />
              <span>~</span>
              <input
                type="date"
                value={pendingTo}
                onChange={(e) => setPendingTo(e.target.value)}
                className="bg-chess-surface border border-chess-border rounded-md px-2 py-1.5 text-chess-primary focus:outline-none focus:border-chess-accent"
              />
              <button
                type="button"
                onClick={() => { setCustomFrom(pendingFrom); setCustomTo(pendingTo); }}
                disabled={!pendingFrom}
                className="px-3 py-1.5 bg-chess-accent hover:bg-chess-accent/80 disabled:opacity-40 text-white rounded-md font-medium transition-colors"
              >
                적용
              </button>
            </div>
          )}
        </div>
      )}

      {!submitted && (
        <div className="flex flex-col items-center py-24 gap-3 text-chess-muted">
          <span className="text-5xl select-none">♟️</span>
          <p className="text-sm">유저명을 입력하고 분석을 시작하세요.</p>
        </div>
      )}

      {submitted && (
        <>
          {/* Profile Header */}
          {profile && (
            <div className="flex items-center gap-5 px-1 animate-fade-in">
              {profile.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={submitted}
                  className="w-16 h-16 rounded-full border-2 border-chess-border"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-chess-primary truncate">{submitted}</h2>
                  <span className="text-sm text-chess-muted bg-chess-surface px-2.5 py-1 rounded-full capitalize">
                    {submittedPlatform}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-chess-muted mt-1">
                  {profile.rating_bullet != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-yellow-500">🔫</span>
                      <span className="text-zinc-500">Bullet</span>
                      <span className="text-white font-semibold">{profile.rating_bullet}</span>
                    </span>
                  )}
                  {profile.rating_blitz != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-orange-400">⚡</span>
                      <span className="text-chess-muted">Blitz</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_blitz}</span>
                    </span>
                  )}
                  {profile.rating_rapid != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-blue-400">⏱</span>
                      <span className="text-chess-muted">Rapid</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_rapid}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-16 text-chess-muted animate-pulse">
              데이터 불러오는 중...
            </div>
          )}

          {!isLoading && (
            <div className="space-y-6 animate-fade-in">
              {/* 5게임 미만 블러 오버레이 */}
              {insufficientData && (
                <div className="flex items-center gap-3 bg-amber-950/40 border border-amber-700/50 rounded-2xl px-5 py-4">
                  <span className="text-2xl leading-none select-none">⚠️</span>
                  <div>
                    <p className="font-semibold text-amber-300 text-sm">데이터 부족 — 분석 불가</p>
                    <p className="text-amber-400/70 text-xs mt-0.5">
                      {timeClass.toUpperCase()} · {PERIOD_OPTIONS.find(p => p.value === period)?.label ?? period} 기간에서 {totalGames}게임 조회됨.
                      최소 5게임이 필요합니다. 기간을 늘리거나 분류에 다른 타임클래스를 선택해 보세요.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Section 1 ── */}
              <section className={`bg-chess-surface border border-chess-border rounded-2xl p-8 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
                <SectionHeader title="백 / 흑 첫 수 선호도 및 승률" desc="가장 많이 사용한 오프닝 계열과 결과 분포" />
                {loadingFirst ? (
                  <FirstMovesSkeleton />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                    <FirstMoveBar data={firstMoves?.white ?? []} side="white" />
                    <FirstMoveBar data={firstMoves?.black ?? []} side="black" />
                  </div>
                )}
              </section>

              {/* ── Section 2 ── */}
              <section className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                <div className="lg:col-span-2 bg-chess-surface border border-chess-border rounded-2xl p-8 relative">
                  {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
                  <SectionHeader title="오프닝 트리 탐색기" desc="오프닝별 게임 수 및 승률 — 클릭하여 전개" />
                  {/* 백/흑 탭 */}
                  <div className="flex gap-1 mb-3">
                    {(["white", "black"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setTreeViewSide(s)}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                          treeViewSide === s
                            ? s === "white"
                              ? "bg-chess-bg text-chess-primary"
                              : "bg-chess-primary text-white"
                            : "bg-chess-border/50 text-chess-muted hover:text-chess-primary"
                        }`}
                      >
                        {s === "white" ? "⬜ 백" : "⬛ 흑"}
                      </button>
                    ))}
                  </div>
                  {loadingTreeW || loadingTreeB ? (
                    <OpeningTreeSkeleton />
                  ) : (
                    <OpeningTreeTable
                      data={treeViewSide === "white" ? (openingTreeWhite ?? []) : (openingTreeBlack ?? [])}
                    />
                  )}
                </div>
                <div className="bg-chess-surface border border-chess-border rounded-2xl p-8 relative">
                  {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
                  <SectionHeader title="오프닝 퍼포먼스" desc="Best / Worst 오프닝 요약" />
                  {loadingBW ? (
                    <BestWorstSkeleton />
                  ) : bestWorst ? (
                    <BestWorstCard data={bestWorst} />
                  ) : (
                    <p className="text-chess-muted text-sm">데이터 없음</p>
                  )}
                </div>
              </section>

              {/* ── Section 3 – 시간 압박 블런더 비율 ── */}
              <section className={`bg-chess-surface border border-chess-border rounded-2xl p-8 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
                <SectionHeader title="시간 압박 블런더 비율" desc="남은 시간에 따른 블런더 발생률 추이" />
                {loadingTP ? <TimelineSkeleton /> : <BlunderTimeline data={timePressure} />}
              </section>

              {/* ── Section 4 – 전술 패턴 분석 ── */}
              <section className={`bg-chess-surface border border-chess-border rounded-2xl p-8 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
                <SectionHeader title="전술 패턴 분석" desc="게임 패턴 기반 강점 · 약점 분석" />
                <TacticalPatternsCard
                  data={tacticalPatterns}
                  isLoading={loadingTactical}
                />
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
