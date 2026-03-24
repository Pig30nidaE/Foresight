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
import { PixelKingBlackGlyph, PixelKingWhiteGlyph, PixelWarnGlyph } from "@/shared/components/ui/PixelGlyphs";

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
  const [openingTreeExpanded, setOpeningTreeExpanded] = useState(true);
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
    <div className="space-y-4 sm:space-y-6">
      {/* 게임 횟수 선택 UI */}
      <div className="pixel-frame pixel-hud-fill flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 min-w-0">
        <span className="text-xs font-medium text-chess-primary/75 dark:text-chess-muted shrink-0">{t("as.gameCount")}</span>
        <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
        <div className="inline-flex overflow-hidden border-2 border-chess-border">
          {GAME_COUNT_PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPendingMaxGames(size)}
              className={`font-pixel px-2 sm:px-2.5 py-1 text-xs font-medium ${
                pendingMaxGames === size
                  ? "bg-chess-accent text-white dark:bg-chess-accent/30 dark:text-chess-accent"
                  : "bg-chess-bg dark:bg-chess-bg/50 text-chess-muted hover:text-chess-primary"
              }`}
            >
              <span className="sm:hidden">{size}</span>
              <span className="hidden sm:inline">{size} {t("as.games")}</span>
            </button>
          ))}
        </div>
        </div>
        <button
          type="button"
          onClick={() => setMaxGames(pendingMaxGames)}
          disabled={pendingMaxGames === maxGames}
          className={`font-pixel pixel-btn px-2.5 py-1 text-xs font-semibold shrink-0 ${
            pendingMaxGames === maxGames
              ? "bg-chess-border/60 text-chess-muted cursor-not-allowed opacity-70"
              : "bg-chess-inverse text-white"
          }`}
        >
          {t("as.apply")}
        </button>
        <span className="hidden sm:inline text-xs text-chess-primary/70 dark:text-chess-muted">
          {t("as.currentInfo").replace("{n}", String(maxGames))}
        </span>
      </div>

      {/* 5게임 미만 블러 오버레이 */}
      {insufficientData && (
        <div className="pixel-frame flex items-center gap-3 bg-amber-700/12 dark:bg-amber-500/15 border-amber-800/50 dark:border-amber-400/40 px-5 py-4">
          <PixelWarnGlyph className="text-amber-700 dark:text-amber-400 shrink-0" size={28} />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">{t("as.insufficient")}</p>
            <p className="text-amber-800/80 dark:text-amber-200/75 text-xs mt-0.5">
              {t("as.insufficientDesc")
                .replace("{tc}", timeClass.toUpperCase())
                .replace("{n}", String(totalGames))}
            </p>
          </div>
        </div>
      )}

      {/* ── Section 1 ── */}
      <section
        className={`pixel-frame pixel-hud-fill p-4 sm:p-8 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}
      >
        {insufficientData && <div className="absolute inset-0 z-10 pixel-lock-overlay" aria-hidden />}
        <SectionHeader
          title={t("as.section1Title")}
          desc={t("as.section1Desc")}
          isLoading={loadingFirst}
          progressPercent={section1Progress}
          decorationSticker="HOT"
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
      <section className={`grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}>
        <div className="lg:col-span-2 pixel-frame pixel-hud-fill p-4 sm:p-8 relative">
          {insufficientData && <div className="absolute inset-0 z-10 pixel-lock-overlay" aria-hidden />}
          <SectionHeader
            title={t("as.section2Title")}
            desc={t("as.section2Desc")}
            isLoading={loadingTreeW || loadingTreeB || loadingBW}
            progressPercent={section2Progress}
            decorationSticker="LOL"
          />
          {/* 백/흑 탭 + 트리 접기 */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {(["white", "black"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTreeViewSide(s)}
                  className={`font-pixel pixel-btn px-3 py-1 text-xs font-medium ${
                    treeViewSide === s
                      ? s === "white"
                        ? "bg-chess-bg dark:bg-chess-elevated text-chess-primary"
                        : "bg-chess-inverse text-white"
                      : "bg-chess-border/40 dark:bg-chess-bg/40 text-chess-muted hover:text-chess-primary"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {s === "white" ? (
                      <PixelKingWhiteGlyph size={16} className="opacity-90" />
                    ) : (
                      <PixelKingBlackGlyph size={16} className="opacity-90" />
                    )}
                    {s === "white" ? t("as.white") : t("as.black")}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpeningTreeExpanded((v) => !v)}
              className="font-pixel pixel-btn shrink-0 px-2.5 py-1 text-[11px] font-semibold text-chess-primary bg-chess-surface/80 hover:brightness-[1.03] dark:bg-chess-elevated/50"
              aria-expanded={openingTreeExpanded}
            >
              {openingTreeExpanded ? t("as.openingTreeCollapse") : t("as.openingTreeExpand")}
            </button>
          </div>
          {openingTreeExpanded &&
            (loadingTreeW || loadingTreeB ? (
              <OpeningTreeSkeleton />
            ) : (
              <OpeningTreeTable
                data={treeViewSide === "white" ? (openingTreeWhite ?? []) : (openingTreeBlack ?? [])}
                side={treeViewSide}
              />
            ))}
        </div>
        <div className="pixel-frame pixel-hud-fill p-4 sm:p-8 relative">
          {insufficientData && <div className="absolute inset-0 z-10 pixel-lock-overlay" aria-hidden />}
          <SectionHeader
            title={t("as.section2b.title")}
            desc={t("as.section2b.desc")}
            isLoading={loadingBW}
            progressPercent={section2Progress}
            decorationSticker="RIP"
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

      {/* ── Section 3 – 시간 압박 ── */}
      <section
        className={`pixel-frame pixel-hud-fill p-4 sm:p-8 relative ${insufficientData ? "opacity-40 pointer-events-none select-none" : ""}`}
      >
        {insufficientData && <div className="absolute inset-0 z-10 pixel-lock-overlay" aria-hidden />}
        <SectionHeader
          title={t("as.section3Title")}
          desc={t("as.section3Desc")}
          isLoading={loadingTP}
          progressPercent={section3Progress}
          decorationSticker="MVP"
        />
        {loadingTP ? <TimelineSkeleton /> : <BlunderTimeline data={timePressure} />}
      </section>
    </div>
  );
}
