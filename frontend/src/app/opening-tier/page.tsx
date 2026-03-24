"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { TimeClass } from "@/shared/types";
import type { Color, OpeningTierEntry, Tier } from "@/features/opening-tier/types";
import {
  getOpeningTiers,
  getRatingBrackets,
  OPENING_TIER_AUTH_REQUIRED,
} from "@/features/opening-tier/api";
import FilterBar from "@/features/opening-tier/components/FilterBar";
import TierSection from "@/features/opening-tier/components/TierSection";
import OpeningMovesModal from "@/features/opening-tier/components/OpeningMovesModal";
import { useTranslation } from "@/shared/lib/i18n";
import PixelHudPanelChrome from "@/shared/components/ui/PixelHudPanelChrome";

const TIER_ORDER: Tier[] = ["S", "A", "B", "C", "D"];

export default function OpeningTierPage() {
  const { t } = useTranslation();
  const { status } = useSession();
  const router = useRouter();
  const [speed, setSpeed] = useState<TimeClass>("blitz");
  const [rating, setRating] = useState<number | null>(null);
  const [color, setColor] = useState<Color>("white");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOpening, setSelectedOpening] = useState<OpeningTierEntry | null>(null);

  const { data: bracketsData } = useQuery({
    queryKey: ["opening-tier-brackets", speed],
    queryFn: () => getRatingBrackets(speed),
    enabled: status === "authenticated",
  });

  const brackets = bracketsData?.brackets ?? [];

  useEffect(() => {
    if (brackets.length === 0) return;
    const isCurrentValid = rating !== null && brackets.some((b) => b.lichess_rating === rating);
    if (isCurrentValid) return;
    // Lichess 실제 bucket 표기 기준에서 기본값은 중간 구간 1600.
    const defaultBracket = brackets.find((b) => b.lichess_rating === 1600) ?? brackets[0];
    if (defaultBracket) setRating(defaultBracket.lichess_rating);
  }, [brackets, rating]);

  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["opening-tiers", rating, speed, color, searchQuery],
    queryFn: () => getOpeningTiers(rating as number, speed, color, searchQuery),
    enabled: status === "authenticated" && rating !== null,
    staleTime: 86_400_000 * 30,
    retry: 1,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.state === "warming") {
        const sec = Number(d.retry_after_seconds ?? 8);
        return Math.max(3000, sec * 1000);
      }
      return false;
    },
  });

  const grouped = useMemo(() => {
    const entries: OpeningTierEntry[] = data?.openings ?? [];
    return TIER_ORDER.reduce(
      (acc, tier) => {
        acc[tier] = entries.filter((e) => e.tier === tier);
        return acc;
      },
      {} as Record<Tier, OpeningTierEntry[]>
    );
  }, [data]);

  const showLoading = isLoading || isFetching || data?.state === "warming";
  const tierErrorMessage = useMemo(() => {
    if (!error) return null;
    if (error instanceof Error && error.message === OPENING_TIER_AUTH_REQUIRED) {
      return t("forum.error.loginRequired");
    }
    if (isAxiosError(error)) {
      const statusCode = error.response?.status;
      if (statusCode === 401) {
        return t("tier.page.error401");
      }
      if (statusCode === 403) {
        return t("tier.page.error403");
      }
    }
    return t("tier.error");
  }, [error, t]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/api/auth/signin?callbackUrl=%2Fopening-tier");
    }
  }, [status, router]);

  useEffect(() => {
    if (!error || !isAxiosError(error)) return;
    if (error.response?.status === 401) {
      router.replace("/api/auth/signin?callbackUrl=%2Fopening-tier");
    }
  }, [error, router]);

  if (status !== "authenticated") {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="pixel-frame pixel-hud-fill px-5 py-10 text-center">
          <p className="font-pixel text-sm text-chess-primary">{t("tier.page.authLoading")}</p>
          <p className="mt-2 text-xs text-chess-muted">{t("tier.page.checkingSession")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
      <div className="relative pixel-frame pixel-hud-fill px-4 py-4 sm:px-6 sm:py-5">
        <PixelHudPanelChrome />
        <div className="relative z-[2] text-center">
          <h1 className="font-pixel text-2xl sm:text-3xl font-bold text-chess-primary tracking-wide pixel-glitch-title">
            {t("tier.title")}
          </h1>
        </div>
      </div>

      <FilterBar
        speed={speed}
        onSpeedChange={(s) => setSpeed(s)}
        rating={rating ?? (brackets[0]?.lichess_rating ?? 0)}
        onRatingChange={setRating}
        color={color}
        onColorChange={setColor}
        brackets={brackets}
      />

      <div className="pixel-frame bg-chess-surface/45 dark:bg-chess-elevated/20 px-4 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearchQuery(searchDraft.trim());
          }}
        >
          <input
            type="text"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t("tier.search.placeholder")}
            className="pixel-input min-w-[14rem] flex-1 px-3 py-2 text-sm text-chess-primary"
          />
          <button
            type="submit"
            className="font-pixel pixel-btn px-3 py-2 text-xs bg-chess-surface/85 text-chess-primary"
          >
            {t("board.search.submit")}
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchDraft("");
                setSearchQuery("");
              }}
              className="font-pixel pixel-btn px-3 py-2 text-xs"
            >
              {t("tier.search.reset")}
            </button>
          )}
        </form>
      </div>

      <div className="pixel-frame flex items-start gap-3 bg-chess-surface/50 dark:bg-chess-elevated/20 px-4 py-3 text-sm">
        <span className="font-pixel shrink-0 text-chess-accent mt-0.5">i</span>
        <p className="text-chess-muted leading-relaxed">{t("tier.infoLichess")}</p>
      </div>

      {showLoading && (
        <div className="flex flex-col items-center py-20 gap-4 pixel-frame pixel-hud-fill">
          <div className="inline-grid grid-cols-3 gap-1" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <span
                key={i}
                className={`size-3 border-2 border-chess-border ${i % 3 === 1 ? "bg-chess-accent animate-pulse" : "bg-chess-muted/30"}`}
              />
            ))}
          </div>
          <div className="text-center">
            <p className="font-pixel text-sm text-chess-primary">{t("tier.loading")}</p>
            <p className="text-xs text-chess-muted mt-2 max-w-xs">{t("tier.loadingDetail")}</p>
          </div>
        </div>
      )}

      {error && !showLoading && (
        <div className="pixel-frame border-red-600/45 bg-red-500/10 px-5 py-4 text-sm text-chess-loss">
          {tierErrorMessage}
        </div>
      )}

      {data && data.state !== "warming" && !showLoading && (
        data.total_openings === 0 ? (
          <div className="pixel-frame pixel-hud-fill flex flex-col items-center gap-3 py-16 text-center px-4">
            <p className="font-pixel text-base font-bold text-chess-primary">{t("tier.lackData")}</p>
            <p className="text-chess-muted text-sm max-w-sm" dangerouslySetInnerHTML={{ __html: t("tier.lackDataDetail") }} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm text-chess-muted font-pixel px-1">
              <p>
                <span dangerouslySetInnerHTML={{ __html: t("tier.analyzedTotal").replace("{n}", `<span class="text-chess-primary font-bold">${data.total_openings}</span>`) }} />
              </p>
              {data.collected_at && (
                <p>
                  <span dangerouslySetInnerHTML={{ __html: t("tier.lastCollected").replace("{date}", `<span class="text-chess-primary font-bold">${data.collected_at}</span>`) }} />
                </p>
              )}
            </div>
            {TIER_ORDER.map((tier) => (
              <TierSection
                key={tier}
                tier={tier}
                entries={grouped[tier]}
                color={color}
                defaultOpen={tier === "S" || tier === "A"}
                onOpeningClick={setSelectedOpening}
              />
            ))}
          </div>
        )
      )}
      <OpeningMovesModal
        entry={selectedOpening}
        onClose={() => setSelectedOpening(null)}
        color={color}
      />
    </div>
  );
}
