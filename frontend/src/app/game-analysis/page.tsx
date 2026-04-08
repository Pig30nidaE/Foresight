"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { signIn, useSession } from "next-auth/react";

import { getRecentGamesList } from "@/features/dashboard/api";
import { GameAnalysisPanel } from "@/features/dashboard/components/GameHistorySection";
import { useAnalysisQueue } from "@/features/dashboard/contexts/AnalysisQueueContext";
import { getMeProfile } from "@/features/user-profile/api";
import type { GameSummaryItem } from "@/features/dashboard/types";
import { useSettings } from "@/shared/components/settings/SettingsContext";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import {
  PixelChartGlyph,
  PixelHourglassGlyph,
  PixelTargetGlyph,
  PixelWarnGlyph,
} from "@/shared/components/ui/PixelGlyphs";
import { useTranslation } from "@/shared/lib/i18n";
import type { AnalyzedMove, MoveTier, Platform, TimeClass } from "@/shared/types";

function parsePlatform(value: string | null): Platform {
  return value === "lichess" ? "lichess" : "chess.com";
}

function parseTimeClass(value: string | null): TimeClass {
  if (value === "bullet" || value === "blitz" || value === "rapid" || value === "classical") {
    return value;
  }
  return "blitz";
}

function formatQueueLabel(
  game: GameSummaryItem | undefined,
  locale: string,
  gameId: string,
): string {
  if (!game) return `Game ${gameId}`;
  const datePart = game.played_at
    ? new Date(game.played_at).toLocaleDateString(locale, {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      })
    : "-";
  return `${datePart} ${game.white} vs ${game.black}`;
}

function normalizeOpeningName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export default function GameAnalysisPage() {
  const { t, language } = useTranslation();
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const { stockfishDepth } = useSettings();
  const queue = useAnalysisQueue();

  const platform = parsePlatform(params.get("platform"));
  const username = (params.get("username") ?? "").trim();
  const timeClass = parseTimeClass(params.get("timeClass"));
  const gameId = (params.get("gameId") ?? "").trim();
  const autoStart = params.get("autostart") === "1";
  const autoStartHandledRef = useRef(false);

  const [maxGames, setMaxGames] = useState(50);
  const [selectedTier, setSelectedTier] = useState<MoveTier | "all">("all");
  const [selectedMove, setSelectedMove] = useState<AnalyzedMove | null>(null);

  const dashboardHref = useMemo(() => {
    if (!username) return "/dashboard";
    return `/dashboard?platform=${encodeURIComponent(platform)}&username=${encodeURIComponent(username)}&timeClass=${encodeURIComponent(timeClass)}`;
  }, [platform, timeClass, username]);

  const { data: games, isLoading, isError, refetch } = useQuery({
    queryKey: ["game-analysis-page", platform, username, timeClass, maxGames],
    queryFn: () => getRecentGamesList(platform, username, timeClass, maxGames),
    enabled: Boolean(username && gameId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!gameId || !games || games.length === 0) return;
    const found = games.some((g) => g.game_id === gameId);
    if (found) return;
    if (games.length >= maxGames && maxGames < 180) {
      setMaxGames((prev) => prev + 30);
    }
  }, [gameId, games, maxGames]);

  const targetGame = useMemo(
    () => games?.find((g) => g.game_id === gameId),
    [games, gameId],
  );

  const queueItem = queue.getItem(gameId, stockfishDepth);
  const latestCompleted = queue.getLatestCompleted(gameId);
  const analysisData = queueItem?.result ?? latestCompleted?.result ?? null;
  const isAnalyzing = queueItem?.status === "queued" || queueItem?.status === "analyzing";
  const isAnalysisError = queueItem?.status === "error";
  const isSignedIn = status === "authenticated";

  const { data: analysisTickets = null } = useQuery({
    queryKey: ["my-analysis-tickets", "game-analysis-page", status],
    enabled: isSignedIn,
    queryFn: async () => {
      const token = await getBackendJwt();
      if (!token) return null;
      const me = await getMeProfile(token);
      return typeof me.analysis_tickets === "number" ? me.analysis_tickets : null;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const hasNoTickets = isSignedIn && analysisTickets !== null && analysisTickets <= 0;

  const openingMismatch = useMemo(() => {
    const historyOpeningName = targetGame?.opening_name?.trim();
    const analysisOpeningName = analysisData?.opening?.name?.trim();
    if (!historyOpeningName || !analysisOpeningName) return false;
    return normalizeOpeningName(historyOpeningName) !== normalizeOpeningName(analysisOpeningName);
  }, [analysisData?.opening?.name, targetGame?.opening_name]);

  const analysisDataForView = useMemo(() => {
    if (!analysisData) return null;
    const historyOpeningName = targetGame?.opening_name?.trim();
    const historyOpeningEco = targetGame?.opening_eco?.trim();
    if (!historyOpeningName && !historyOpeningEco) return analysisData;
    if (!openingMismatch && !historyOpeningEco) return analysisData;

    return {
      ...analysisData,
      opening: {
        eco: historyOpeningEco || analysisData.opening?.eco || "",
        name: historyOpeningName || analysisData.opening?.name || "",
      },
    };
  }, [analysisData, openingMismatch, targetGame?.opening_eco, targetGame?.opening_name]);

  useEffect(() => {
    if (!analysisDataForView || selectedMove) return;
    const combined = [
      ...(analysisDataForView.white_analysis.analyzed_moves ?? []),
      ...(analysisDataForView.black_analysis.analyzed_moves ?? []),
    ].sort((a, b) => a.halfmove - b.halfmove);
    if (combined.length > 0) setSelectedMove(combined[0]);
  }, [analysisDataForView, selectedMove]);

  const locale = language === "en" ? "en-US" : "ko-KR";
  const isWhite = targetGame
    ? targetGame.white.toLowerCase() === username.toLowerCase()
    : true;

  const closeAnalysisPage = () => {
    if (typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    router.push(dashboardHref);
  };

  const startAnalysis = () => {
    if (!isSignedIn) {
      signIn();
      return;
    }
    if (hasNoTickets) return;
    if (!targetGame?.pgn) return;
    const queueLabel = formatQueueLabel(targetGame, locale, gameId);
    queue.enqueue(gameId, targetGame.pgn, stockfishDepth, queueLabel, dashboardHref);
  };

  useEffect(() => {
    if (!autoStart || autoStartHandledRef.current) return;
    if (!isSignedIn) return;
    if (hasNoTickets) return;
    if (!targetGame?.pgn) return;

    const alreadyDone = queueItem?.status === "complete" && !!queueItem?.result;
    const alreadyRunning = queueItem?.status === "queued" || queueItem?.status === "analyzing";
    if (alreadyDone || alreadyRunning) {
      autoStartHandledRef.current = true;
      return;
    }

    autoStartHandledRef.current = true;
    const queueLabel = formatQueueLabel(targetGame, locale, gameId);
    queue.enqueue(gameId, targetGame.pgn, stockfishDepth, queueLabel, dashboardHref);
  }, [
    autoStart,
    dashboardHref,
    gameId,
    isSignedIn,
    hasNoTickets,
    locale,
    queue,
    queueItem?.result,
    queueItem?.status,
    stockfishDepth,
    targetGame,
  ]);

  const gameNotFoundAtLimit = Boolean(
    gameId &&
      username &&
      !isLoading &&
      !targetGame &&
      (!games || games.length < maxGames || maxGames >= 180),
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-6">
      {!gameId && (
        <div className="pixel-frame p-4 text-sm text-chess-loss bg-red-500/10 border-red-500/35">
          {t("ga.page.missingGameId")}
        </div>
      )}

      {gameId && !username && (
        <div className="pixel-frame p-4 text-sm text-chess-loss bg-red-500/10 border-red-500/35">
          {t("ga.page.missingSearchContext")}
        </div>
      )}

      {gameId && username && isLoading && (
        <div className="pixel-frame p-4 text-sm text-chess-muted">{t("ga.page.loadingGame")}</div>
      )}

      {gameId && username && isError && (
        <div className="pixel-frame p-4 space-y-2 bg-red-500/10 border-red-500/35">
          <p className="text-sm text-chess-loss">{t("gh.error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="font-pixel pixel-btn px-3 py-1.5 text-xs text-chess-primary bg-chess-surface"
          >
            {t("gh.retry")}
          </button>
        </div>
      )}

      {targetGame && !analysisData && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <button
            type="button"
            onClick={startAnalysis}
            disabled={isAnalyzing || !targetGame.pgn || hasNoTickets}
            className={`font-pixel pixel-btn inline-flex items-center gap-2 px-4 py-2.5 border disabled:cursor-not-allowed ${
              hasNoTickets
                ? "bg-chess-accent/20 hover:bg-chess-accent/30 text-black border-chess-accent/55 disabled:opacity-100"
                : "bg-chess-accent/20 hover:bg-chess-accent/30 text-chess-accent border-chess-accent/55 disabled:opacity-50"
            }`}
          >
            {isAnalyzing ? (
              <>
                <PixelHourglassGlyph className="animate-pulse text-chess-accent" size={16} />
                <span>{t("gh.btn.analyzing")}</span>
              </>
            ) : !isSignedIn ? (
              <>
                <PixelTargetGlyph className="text-chess-accent" size={16} />
                <span>{t("gh.btn.signInToAnalyze")}</span>
              </>
            ) : hasNoTickets ? (
              <>
                <PixelWarnGlyph className="text-black" size={16} />
                <span className="text-center leading-snug">
                  <span className="block text-sm font-extrabold text-black">{t("ticket.insufficient")}</span>
                  <span className="block text-xs font-semibold text-black">{t("gh.analyze.ticketGuide")}</span>
                </span>
              </>
            ) : (
              <>
                <PixelChartGlyph className="text-chess-accent" size={16} />
                <span>{t("gh.btn.analyze")}</span>
              </>
            )}
          </button>

          <span className="text-xs text-chess-muted">
            {t("ga.page.depthLabel").replace("{depth}", String(stockfishDepth))}
          </span>

          {!targetGame.pgn && (
            <p className="text-xs text-chess-loss">{t("ga.page.pgnMissing")}</p>
          )}

          {!isSignedIn && (
            <p className="text-xs text-chess-muted">{t("gh.analyze.loginRequired")}</p>
          )}
        </div>
      )}

      {gameNotFoundAtLimit && !analysisData && (
        <div className="pixel-frame p-4 sm:p-5 bg-amber-500/10 border-amber-500/35 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <PixelWarnGlyph size={16} />
            <p className="text-sm font-semibold">{t("ga.page.gameNotFound")}</p>
          </div>
          <Link
            href={dashboardHref}
            className="font-pixel pixel-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm bg-chess-surface/85 text-chess-primary"
          >
            {t("ga.page.backToDashboard")}
          </Link>
          <button
            type="button"
            onClick={closeAnalysisPage}
            className="font-pixel pixel-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm bg-chess-inverse text-white"
          >
            {t("ga.page.closeWindow")}
          </button>
        </div>
      )}

      {isAnalyzing && queueItem && (
        <div className="pixel-frame p-4 bg-chess-surface/85 dark:bg-chess-surface/40">
          <p className="text-sm font-semibold text-chess-primary">
            {queueItem.status === "queued" ? t("gh.analyze.queued") : t("gh.analyze.progressTitle")}
          </p>
          {queueItem.status === "analyzing" && queueItem.totalMoves > 0 ? (
            <>
              <div className="mt-3 h-2.5 w-full border border-chess-border bg-chess-bg overflow-hidden">
                <div
                  className="h-full bg-chess-accent transition-all duration-300 ease-out"
                  style={{ width: `${Math.round((queueItem.progress / queueItem.totalMoves) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-chess-muted leading-relaxed">
                {t("gh.analyze.streaming")
                  .replace("{current}", String(queueItem.progress))
                  .replace("{total}", String(queueItem.totalMoves))}
              </p>
            </>
          ) : (
            <div className="mt-3 h-2.5 w-full border border-chess-border bg-chess-bg overflow-hidden">
              <div className="h-full w-1/3 bg-chess-accent animate-loading-slide will-change-transform" />
            </div>
          )}
        </div>
      )}

      {isAnalysisError && (
        <div className="p-4 pixel-frame border-red-500/45 bg-red-500/10 text-chess-loss text-sm">
          {queueItem?.error || t("gh.analyze.error")}
        </div>
      )}

      {analysisDataForView && (
        <div className="pixel-frame pixel-hud-fill p-2 sm:p-4">
          <GameAnalysisPanel
            data={analysisDataForView}
            selectedTier={selectedTier}
            setSelectedTier={setSelectedTier}
            selectedMove={selectedMove}
            setSelectedMove={setSelectedMove}
            onClose={closeAnalysisPage}
            boardOrientation={isWhite ? "white" : "black"}
          />
        </div>
      )}
    </section>
  );
}
