"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  getFirstMoveStats,
  getOpeningTree,
  getBestWorstOpenings,
  getTimePressure,
} from "@/lib/api";
import type { Platform, TimeClass } from "@/types";

import FirstMoveBar from "./charts/FirstMoveBar";
import OpeningTreeTable from "./charts/OpeningTreeTable";
import BestWorstCard from "./charts/BestWorstCard";
import BlunderTimeline from "./charts/BlunderTimeline";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import {
  FirstMovesSkeleton,
  OpeningTreeSkeleton,
  BestWorstSkeleton,
  TimelineSkeleton,
} from "@/shared/components/ui/SkeletonCard";
import { useTranslation } from "@/shared/lib/i18n";

const GAME_COUNT_PRESETS = [50, 100, 200, 300, 500] as const;

interface AnalysisSectionProps {
  username: string;
  platform: Platform;
  timeClass: TimeClass;
  sinceMs?: number;
  untilMs?: number;
}

export default function AnalysisSection({
  username,
  platform,
  timeClass,
  sinceMs,
  untilMs,
}: AnalysisSectionProps) {
  const [treeViewSide, setTreeViewSide] = useState<"white" | "black">("white");
  const [maxGames, setMaxGames] = useState<number>(100);
  const [pendingMaxGames, setPendingMaxGames] = useState<number>(100);
  const { t } = useTranslation();

  // 상대 분석 데이터 독립적 로딩 (캐싱 설정: 5분 stale, 30분 cache)
  const queryOptions = {
    staleTime: 5 * 60 * 1000, // 5분간 fresh 상태 유지
    gcTime: 30 * 60 * 1000,   // 30분간 캐시 유지
    refetchOnWindowFocus: false,
  };

  const { data: firstMoves, isLoading: loadingFirst, isSuccess: firstMovesLoaded } = useQuery({
    queryKey: ["first-moves", platform, username, timeClass, sinceMs, untilMs, maxGames],
    queryFn: () => getFirstMoveStats(platform, username, timeClass, sinceMs, untilMs, maxGames),
    enabled: !!username,
    ...queryOptions,
  });

  const { data: openingTreeWhite, isLoading: loadingTreeW, isSuccess: treeWLoaded } = useQuery({
    queryKey: ["opening-tree-white", platform, username, timeClass, sinceMs, untilMs, maxGames],
    queryFn: () => getOpeningTree(platform, username, timeClass, sinceMs, untilMs, "white", maxGames),
    enabled: !!username,
    ...queryOptions,
  });

  const { data: openingTreeBlack, isLoading: loadingTreeB, isSuccess: treeBLoaded } = useQuery({
    queryKey: ["opening-tree-black", platform, username, timeClass, sinceMs, untilMs, maxGames],
    queryFn: () => getOpeningTree(platform, username, timeClass, sinceMs, untilMs, "black", maxGames),
    enabled: !!username,
    ...queryOptions,
  });

  const { data: bestWorst, isLoading: loadingBW, isSuccess: bwLoaded } = useQuery({
    queryKey: ["best-worst", platform, username, timeClass, sinceMs, untilMs, maxGames],
    queryFn: () => getBestWorstOpenings(platform, username, timeClass, sinceMs, untilMs, maxGames),
    enabled: !!username,
    ...queryOptions,
  });

  const { data: timePressure, isLoading: loadingTP, isSuccess: timePressureLoaded } = useQuery({
    queryKey: ["time-pressure", platform, username, timeClass, sinceMs, untilMs, maxGames],
    queryFn: () => getTimePressure(platform, username, timeClass, sinceMs, untilMs, maxGames),
    enabled: !!username,
    staleTime: 120_000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const totalGames = useMemo(() => firstMoves?.total_games ?? 0, [firstMoves]);
  const insufficientData = firstMovesLoaded && username !== "" && totalGames < 5;

  const section1Progress = loadingFirst ? 0 : firstMovesLoaded ? 100 : 0;
  const section2LoadedCount = Number(treeWLoaded) + Number(treeBLoaded) + Number(bwLoaded);
  const section2Progress = Math.round((section2LoadedCount / 3) * 100);
  const section3Progress = loadingTP ? 0 : timePressureLoaded ? 100 : 0;

  return (
    <div className="space-y-6">
      {/* 게임 횟수 선택 UI */}
      <div className="flex items-center gap-2 rounded-lg border border-chess-border px-3 py-2 bg-chess-surface/50">
        <span className="text-xs font-medium text-chess-muted">{t("as.gameCount")}</span>
        <div className="flex rounded-md overflow-hidden border border-chess-border">
          {GAME_COUNT_PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPendingMaxGames(size)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                pendingMaxGames === size
                  ? "bg-chess-accent text-white"
                  : "bg-chess-surface text-chess-muted hover:text-chess-primary"
              }`}
            >
              {size} {t("as.games")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMaxGames(pendingMaxGames)}
          disabled={pendingMaxGames === maxGames}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
            pendingMaxGames === maxGames
              ? "bg-chess-border/60 text-chess-muted cursor-not-allowed"
              : "bg-chess-primary text-white hover:bg-chess-primary/85"
          }`}
        >
          {t("as.apply")}
        </button>
        <span className="text-xs text-chess-muted ml-2">
          {t("as.currentInfo").replace("{n}", String(maxGames))}
        </span>
      </div>

      {/* 5게임 미만 블러 오버레이 */}
      {insufficientData && (
        <div className="flex items-center gap-3 bg-amber-700/8 border border-amber-700/35 rounded-2xl px-5 py-4">
          <span className="text-2xl leading-none select-none">⚠️</span>
          <div>
            <p className="font-semibold text-amber-700 text-sm">{t("as.insufficient")}</p>
            <p className="text-amber-700/70 text-xs mt-0.5">
              {t("as.insufficientDesc")
                .replace("{tc}", timeClass.toUpperCase())
                .replace("{n}", String(totalGames))}
            </p>
          </div>
        </div>
      )}

      {/* ── Section 1 ── */}
      <section className={`bg-chess-surface border border-chess-border rounded-2xl p-8 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
        {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
        <SectionHeader
          title={t("as.section1Title")}
          desc={t("as.section1Desc")}
          isLoading={loadingFirst}
          progressPercent={section1Progress}
        />
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
          <SectionHeader
            title={t("as.section2Title")}
            desc={t("as.section2Desc")}
            isLoading={loadingTreeW || loadingTreeB || loadingBW}
            progressPercent={section2Progress}
          />
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
                {s === "white" ? t("as.white") : t("as.black")}
              </button>
            ))}
          </div>
          {loadingTreeW || loadingTreeB ? (
            <OpeningTreeSkeleton />
          ) : (
            <OpeningTreeTable
              data={treeViewSide === "white" ? (openingTreeWhite ?? []) : (openingTreeBlack ?? [])}
              side={treeViewSide}
            />
          )}
        </div>
        <div className="bg-chess-surface border border-chess-border rounded-2xl p-8 relative">
          {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
          <SectionHeader
            title={t("as.section2b.title")}
            desc={t("as.section2b.desc")}
            isLoading={loadingBW}
            progressPercent={section2Progress}
          />
          {loadingBW ? (
            <BestWorstSkeleton />
          ) : bestWorst ? (
            <BestWorstCard data={bestWorst} />
          ) : (
            <p className="text-chess-muted text-sm">{t("as.noData")}</p>
          )}
        </div>
      </section>

      {/* ── Section 3 – 시간 압박 블런더 비율 ── */}
      <section className={`bg-chess-surface border border-chess-border rounded-2xl p-8 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
        {insufficientData && <div className="absolute inset-0 rounded-2xl backdrop-blur-sm z-10" />}
        <SectionHeader
          title={t("as.section3Title")}
          desc={t("as.section3Desc")}
          isLoading={loadingTP}
          progressPercent={section3Progress}
        />
        {loadingTP ? <TimelineSkeleton /> : <BlunderTimeline data={timePressure} />}
      </section>
    </div>
  );
}
