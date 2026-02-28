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
import { Suspense, useState, useEffect } from "react";
import FirstMoveBar from "@/components/charts/FirstMoveBar";
import OpeningTreeTable from "@/components/charts/OpeningTreeTable";
import BestWorstCard from "@/components/charts/BestWorstCard";
import BlunderTimeline from "@/components/charts/BlunderTimeline";
import MoveQualityDonut from "@/components/charts/MoveQualityDonut";

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

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
    queryKey: ["first-moves", submittedPlatform, submitted, timeClass],
    queryFn: () => getFirstMoveStats(submittedPlatform, submitted, timeClass),
    enabled,
  });
  const { data: openingTree, isLoading: loadingTree } = useQuery({
    queryKey: ["opening-tree", submittedPlatform, submitted, timeClass],
    queryFn: () => getOpeningTree(submittedPlatform, submitted, timeClass),
    enabled,
  });
  const { data: bestWorst, isLoading: loadingBW } = useQuery({
    queryKey: ["best-worst", submittedPlatform, submitted, timeClass],
    queryFn: () => getBestWorstOpenings(submittedPlatform, submitted, timeClass),
    enabled,
  });
  const { data: timePressure, isLoading: loadingTP } = useQuery({
    queryKey: ["time-pressure", submittedPlatform, submitted, timeClass],
    queryFn: () => getTimePressure(submittedPlatform, submitted, timeClass, 100),
    enabled,
    staleTime: 120_000,   // PGN 파싱 비용이 크므로 2분 캐시
  });

  // Step 6: Stockfish 수 품질 분석 (시간이 오래 걸리므로 별도 staleTime)
  const { data: moveQuality, isLoading: loadingMQ } = useQuery({
    queryKey: ["move-quality", submittedPlatform, submitted, timeClass],
    queryFn: () => getMoveQuality(submittedPlatform, submitted, timeClass, 5),
    enabled,
    staleTime: 300_000,   // 5분 캐시 (Stockfish 분석 비용)
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

      {!submitted && (
        <div className="text-center py-20 text-zinc-500">
          유저명을 입력하고 분석을 시작하세요.
        </div>
      )}

      {submitted && (
        <>
          {/* Profile Header */}
          {profile && (
            <div className="flex items-center gap-4 px-1">
              {profile.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={submitted}
                  className="w-12 h-12 rounded-full border border-zinc-700"
                />
              )}
              <div>
                <h2 className="text-xl font-bold text-white">{submitted}</h2>
                <div className="flex gap-4 text-sm text-zinc-400 mt-0.5">
                  {profile.rating_bullet && (
                    <span>Bullet <span className="text-white font-medium">{profile.rating_bullet}</span></span>
                  )}
                  {profile.rating_blitz && (
                    <span>Blitz <span className="text-white font-medium">{profile.rating_blitz}</span></span>
                  )}
                  {profile.rating_rapid && (
                    <span>Rapid <span className="text-white font-medium">{profile.rating_rapid}</span></span>
                  )}
                </div>
              </div>
              <span className="ml-auto text-xs text-zinc-600 uppercase tracking-wide">
                {submittedPlatform} · {timeClass}
              </span>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-16 text-zinc-400 animate-pulse">
              데이터 불러오는 중...
            </div>
          )}

          {!isLoading && (
            <>
              {/* ── Section 1: 첫 수 선호도 ── */}
              <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h2 className="text-base font-bold text-white mb-1">
                  1. 백 / 흑 첫 수 선호도 및 승률
                </h2>
                <p className="text-zinc-500 text-xs mb-5">
                  가장 많이 사용한 오프닝 계열과 결과 분포
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FirstMoveBar
                    data={firstMoves?.white ?? []}
                    side="white"
                  />
                  <FirstMoveBar
                    data={firstMoves?.black ?? []}
                    side="black"
                  />
                </div>
              </section>

              {/* ── Section 2: 오프닝 트리 + 요약 ── */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 2-A */}
                <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h2 className="text-base font-bold text-white mb-1">
                    2-A. 오프닝 트리 탐색기
                  </h2>
                  <p className="text-zinc-500 text-xs mb-4">
                    ECO 카테고리별 게임 수 및 승률
                  </p>
                  <OpeningTreeTable data={openingTree ?? []} />
                </div>
                {/* 2-B */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h2 className="text-base font-bold text-white mb-1">
                    2-B. 오프닝 퍼포먼스
                  </h2>
                  <p className="text-zinc-500 text-xs mb-4">
                    Best / Worst 오프닝 요약
                  </p>
                  {bestWorst ? (
                    <BestWorstCard data={bestWorst} />
                  ) : (
                    <p className="text-zinc-500 text-sm">데이터 없음</p>
                  )}
                </div>
              </section>

              {/* ── Section 3: 블런더 + 수 품질 ── */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 3-A */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h2 className="text-base font-bold text-white mb-1">
                    3-A. 시간 압박 블런더 비율
                  </h2>
                  <p className="text-zinc-500 text-xs mb-4">
                    남은 시간에 따른 블런더 발생률 추이
                  </p>
                  <BlunderTimeline data={timePressure} />
                </div>
                {/* 3-B */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h2 className="text-base font-bold text-white mb-1">
                    3-B. 전반적인 수 품질 비율
                  </h2>
                  <p className="text-zinc-500 text-xs mb-4">
                    Best · Excellent · Good · Inaccuracy · Mistake · Blunder
                  </p>
                  <MoveQualityDonut data={moveQuality} isLoading={loadingMQ} />
                </div>
              </section>
            </>
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
