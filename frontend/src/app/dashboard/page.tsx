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
  getPerformanceSummary,
  getMoveQuality,
  getRatingHistory,
} from "@/lib/api";
import type { Platform, TimeClass } from "@/types";
import { Suspense, useState, useEffect, useMemo } from "react";
import FirstMoveBar from "@/components/charts/FirstMoveBar";
import OpeningTreeTable from "@/components/charts/OpeningTreeTable";
import BestWorstCard from "@/components/charts/BestWorstCard";
import BlunderTimeline from "@/components/charts/BlunderTimeline";
import TacticalPatternsCard from "@/components/charts/TacticalPatternsCard";
import MoveQualityDonut from "@/components/charts/MoveQualityDonut";
import RatingTrendChart from "@/components/charts/RatingTrendChart";
import SectionHeader from "@/components/ui/SectionHeader";
import {
  FirstMovesSkeleton,
  OpeningTreeSkeleton,
  BestWorstSkeleton,
  TimelineSkeleton,
} from "@/components/ui/SkeletonCard";

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

  const { data: firstMoves, isLoading: loadingFirst } = useQuery({
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

  // 전술 패턴 분석 (ML 기반)
  const { data: tacticalPatterns, isLoading: loadingTactical } = useQuery({
    queryKey: ["tactical-patterns", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getTacticalPatterns(submittedPlatform, submitted, timeClass, sinceMs, untilMs),
    enabled,
    staleTime: 180_000,
    retry: 1,
  });

  // 퍼포먼스 요약 (승/패/무 + recent_form)
  const { data: performance } = useQuery({
    queryKey: ["performance", submittedPlatform, submitted, timeClass],
    queryFn: () => getPerformanceSummary(submittedPlatform, submitted, timeClass),
    enabled,
    staleTime: 120_000,
  });

  // 레이팅 히스토리 트렌드
  const { data: ratingHistory, isLoading: loadingRH } = useQuery({
    queryKey: ["rating-history", submittedPlatform, submitted, timeClass, sinceMs, untilMs],
    queryFn: () => getRatingHistory(submittedPlatform, submitted, timeClass, sinceMs, untilMs),
    enabled,
    staleTime: 120_000,
  });

  // 수 품질 분석 (Stockfish — 느림, 비활성화 시 수동 사용)
  const [mqEnabled, setMqEnabled] = useState(false);
  const { data: moveQuality, isLoading: loadingMQ } = useQuery({
    queryKey: ["move-quality", submittedPlatform, submitted, timeClass],
    queryFn: () => getMoveQuality(submittedPlatform, submitted, timeClass, 5),
    enabled: enabled && mqEnabled,
    staleTime: 600_000,
    retry: 0,
  });

  const isLoading = loadingFirst || loadingTreeW || loadingTreeB || loadingBW || loadingTP;

  const totalGames = useMemo(() => {
    const w = (firstMoves?.white ?? []).reduce((s, e) => s + e.games, 0);
    const b = (firstMoves?.black ?? []).reduce((s, e) => s + e.games, 0);
    return w + b;
  }, [firstMoves]);

  const insufficientData = !loadingFirst && submitted !== "" && totalGames > 0 && totalGames < 10;

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
          {TIME_CLASSES.map((tc) => {
            const count = tcGameCount(tc);
            return (
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
              {/* 10게임 미만 블러 오버레이 */}
              {insufficientData && (
                <div className="relative bg-zinc-900 border border-amber-700/50 rounded-2xl p-6 text-center">
                  <span className="text-amber-400 text-sm font-medium">
                    ⚠️ 데이터 부족 — 현재 필터 기준 게임 수가 10게임 미만입니다.
                  </span>
                  <p className="text-zinc-500 text-xs mt-1">기간 범위를 늘리거나 다른 타임클래스를 선택해 보세요.</p>
                </div>
              )}

              {/* ── KPI + 레이팅 트렌드 ── */}
              {performance && (
                <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* KPI 카드 (왼쪽 2열) */}
                  <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">퍼포먼스 요약</h3>
                      <span className="text-xs text-zinc-600">{performance.total_games}게임</span>
                    </div>
                    {/* Win / Draw / Loss 바 */}
                    {performance.total_games > 0 && (
                      <div>
                        <div className="flex rounded-full overflow-hidden h-2.5 mb-2">
                          <div
                            className="bg-emerald-500 transition-all"
                            style={{ width: `${(performance.wins / performance.total_games) * 100}%` }}
                          />
                          <div
                            className="bg-zinc-500 transition-all"
                            style={{ width: `${(performance.draws / performance.total_games) * 100}%` }}
                          />
                          <div
                            className="bg-red-500 transition-all"
                            style={{ width: `${(performance.losses / performance.total_games) * 100}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-3 text-center gap-2">
                          <div>
                            <p className="text-emerald-400 font-bold text-lg">{performance.wins}</p>
                            <p className="text-zinc-600 text-xs">승</p>
                          </div>
                          <div>
                            <p className="text-zinc-400 font-bold text-lg">{performance.draws}</p>
                            <p className="text-zinc-600 text-xs">무</p>
                          </div>
                          <div>
                            <p className="text-red-400 font-bold text-lg">{performance.losses}</p>
                            <p className="text-zinc-600 text-xs">패</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* 승률 */}
                    <div className="flex items-baseline gap-2 pt-1 border-t border-zinc-800">
                      <span className={`text-3xl font-bold ${
                        performance.win_rate >= 55 ? "text-emerald-400"
                        : performance.win_rate >= 45 ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {performance.win_rate}%
                      </span>
                      <span className="text-zinc-500 text-sm">승률</span>
                    </div>
                    {/* 최근 폼 */}
                    {performance.recent_form.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-1.5">최근 {performance.recent_form.length}게임 폼</p>
                        <div className="flex gap-0.5 flex-wrap">
                          {performance.recent_form.map((r, i) => (
                            <div
                              key={i}
                              title={r === "win" ? "승" : r === "draw" ? "무" : "패"}
                              className={`w-3.5 h-3.5 rounded-sm ${
                                r === "win" ? "bg-emerald-500"
                                : r === "draw" ? "bg-zinc-500"
                                : "bg-red-500"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 레이팅 트렌드 (오른쪽 3열) */}
                  <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                      레이팅 트렌드
                    </h3>
                    <RatingTrendChart data={ratingHistory ?? []} isLoading={loadingRH} />
                  </div>
                </section>
              )}

              {/* ── Section 1 ── */}
              <section className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
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
              <section className={`grid grid-cols-1 lg:grid-cols-3 gap-4 ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative">
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
                              ? "bg-zinc-200 text-zinc-900"
                              : "bg-zinc-700 text-zinc-100"
                            : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
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
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative">
                  {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
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

              {/* ── Section 3 – 시간 압박 블런더 비율 ── */}
              <section className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
                <SectionHeader title="시간 압박 블런더 비율" desc="남은 시간에 따른 블런더 발생률 추이" />
                {loadingTP ? <TimelineSkeleton /> : <BlunderTimeline data={timePressure} />}
              </section>

              {/* ── Section 4 – 전술 패턴 분석 ── */}
              <section className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
                {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
                <SectionHeader title="전술 패턴 분석" desc="ML 기반 10종 전술 패턴 강점 · 약점 분석" />
                <TacticalPatternsCard data={tacticalPatterns} isLoading={loadingTactical} />
              </section>

              {/* ── Section 5 – 수 품질 분석 (Stockfish, 수동 실행) ── */}
              <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <SectionHeader
                      title="수 품질 정밀 분석"
                      desc="Stockfish 엔진으로 최근 5게임의 Best/Blunder 비율 및 정확도 산출"
                    />
                  </div>
                  {!mqEnabled && (
                    <button
                      onClick={() => setMqEnabled(true)}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                    >
                      분석 시작
                    </button>
                  )}
                </div>
                {mqEnabled ? (
                  <MoveQualityDonut data={moveQuality} isLoading={loadingMQ} />
                ) : (
                  <div className="flex items-center gap-3 py-4 text-zinc-600 text-sm">
                    <span className="text-2xl">🔍</span>
                    <p>
                      수 품질 분석은 Stockfish 엔진을 사용하며 약 20~40초가 소요됩니다.{" "}
                      <button
                        onClick={() => setMqEnabled(true)}
                        className="text-emerald-400 hover:underline"
                      >
                        분석 시작
                      </button>
                    </p>
                  </div>
                )}
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
