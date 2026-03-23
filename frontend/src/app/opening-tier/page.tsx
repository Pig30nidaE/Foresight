"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TimeClass } from "@/shared/types";
import type { Color, OpeningTierEntry, Tier } from "@/features/opening-tier/types";
import { getOpeningTiers, getRatingBrackets } from "@/features/opening-tier/api";
import FilterBar from "@/features/opening-tier/components/FilterBar";
import TierSection from "@/features/opening-tier/components/TierSection";
import OpeningMovesModal from "@/features/opening-tier/components/OpeningMovesModal";
import { useTranslation } from "@/shared/lib/i18n";

const TIER_ORDER: Tier[] = ["S", "A", "B", "C", "D"];

export default function OpeningTierPage() {
  const { t } = useTranslation();
  const [speed, setSpeed] = useState<TimeClass>("blitz");
  const [rating, setRating] = useState(1800);
  const [color, setColor] = useState<Color>("white");
  const [selectedOpening, setSelectedOpening] = useState<OpeningTierEntry | null>(null);

  const { data: bracketsData } = useQuery({
    queryKey: ["opening-tier-brackets", speed],
    queryFn: () => getRatingBrackets(speed),
  });

  const brackets = bracketsData?.brackets ?? [];

  // Ensure selected rating stays valid when speed changes
  useEffect(() => {
    if (brackets.length > 0 && !brackets.find((b) => b.lichess_rating === rating)) {
      const defaultBracket = brackets.find((b) => b.lichess_rating === 1800) ?? brackets[2];
      if (defaultBracket) setRating(defaultBracket.lichess_rating);
    }
  }, [brackets, rating]);


  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["opening-tiers", rating, speed, color],
    queryFn: () => getOpeningTiers(rating, speed, color),
    enabled: !!rating,
    staleTime: 86_400_000 * 30, // 30d — matches server-side TTL
    retry: 1,
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

  const showLoading = isLoading || isFetching;

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">{t("tier.title")}</h1>
          <p className="text-chess-muted text-sm">
            {t("tier.subtitle")}
          </p>
        </div>

        {/* Filter Bar */}
        <FilterBar
          speed={speed}
          onSpeedChange={(s) => setSpeed(s)}
          rating={rating}
          onRatingChange={setRating}
          color={color}
          onColorChange={setColor}
          brackets={brackets}
        />

        {/* Lichess data notice */}
        <div className="flex items-start gap-2 bg-chess-surface/60 border border-chess-border rounded-xl px-4 py-3 text-sm">
          <span className="text-chess-muted shrink-0 mt-0.5">ℹ</span>
          <p className="text-chess-muted">
            {t("tier.infoLichess")}
          </p>
        </div>

        {/* Loading */}
        {showLoading && (
          <div className="flex flex-col items-center py-24 gap-4 text-chess-muted">
            <div className="w-8 h-8 border-2 border-chess-border border-t-chess-accent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm">{t("tier.loading")}</p>
              <p className="text-xs text-chess-muted mt-1">
                {t("tier.loadingDetail")}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !showLoading && (
          <div className="bg-red-600/8 border border-red-600/30 rounded-xl px-5 py-4 text-sm text-red-700">
            {t("tier.error")}
          </div>
        )}

        {/* Tier Sections */}
        {data && !showLoading && (
          data.total_openings === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <p className="text-chess-primary font-medium">{t("tier.lackData")}</p>
              <p className="text-chess-muted text-sm max-w-sm" dangerouslySetInnerHTML={{ __html: t("tier.lackDataDetail") }} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-chess-muted">
                <p>
                  <span dangerouslySetInnerHTML={{ __html: t("tier.analyzedTotal").replace("{n}", `<span class="text-chess-primary font-medium">${data.total_openings}</span>`) }} />
                </p>
                {data.collected_at && (
                  <p>
                    <span dangerouslySetInnerHTML={{ __html: t("tier.lastCollected").replace("{date}", `<span class="text-chess-primary">${data.collected_at}</span>`) }} />
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
