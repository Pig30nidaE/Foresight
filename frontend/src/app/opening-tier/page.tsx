"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TimeClass } from "@/shared/types";
import type { Color, OpeningTierEntry, Tier } from "@/features/opening-tier/types";
import { getOpeningTiers, getRatingBrackets } from "@/features/opening-tier/api";
import FilterBar from "@/features/opening-tier/components/FilterBar";
import TierSection from "@/features/opening-tier/components/TierSection";
import OpeningMovesModal from "@/features/opening-tier/components/OpeningMovesModal";

const TIER_ORDER: Tier[] = ["S", "A", "B", "C", "D"];

export default function OpeningTierPage() {
  const [platform, setPlatform] = useState<"lichess" | "chess.com">("lichess");
  const [speed, setSpeed] = useState<TimeClass>("blitz");
  const [rating, setRating] = useState(1600);
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
      const defaultBracket = brackets.find((b) => b.lichess_rating === 1600) ?? brackets[4];
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
    <main className="min-h-screen bg-chess-bg text-chess-primary p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-1">오프닝 티어표</h1>
          <p className="text-chess-muted text-sm">
            레이팅 구간별 오프닝 승률 랭킹 — Lichess 기보 기반 집계
          </p>
        </div>

        {/* Filter Bar */}
        <FilterBar
          platform={platform}
          onPlatformChange={setPlatform}
          speed={speed}
          onSpeedChange={(s) => setSpeed(s)}
          rating={rating}
          onRatingChange={setRating}
          color={color}
          onColorChange={setColor}
          brackets={brackets}
        />

        {/* Chess.com info note */}
        {platform === "chess.com" && (
          <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-700/30 rounded-xl px-4 py-3 text-sm">
            <span className="text-amber-400 shrink-0 mt-0.5">ℹ</span>
            <p className="text-amber-300/80">
              Chess.com 레이팅 수치는 대략적인 환산값입니다. 실제 데이터는 Lichess 기보를 기반으로 집계됩니다.
            </p>
          </div>
        )}

        {/* Loading */}
        {showLoading && (
          <div className="flex flex-col items-center py-24 gap-4 text-chess-muted">
            <div className="w-8 h-8 border-2 border-chess-border border-t-chess-accent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm">오프닝 데이터 수집 중...</p>
              <p className="text-xs text-chess-muted mt-1">
                첫 요청 시 Lichess Explorer 탐색으로 최대 2–3분 소요됩니다.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !showLoading && (
          <div className="bg-red-950/40 border border-red-700/30 rounded-xl px-5 py-4 text-sm text-red-300">
            데이터 로드에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        {/* Tier Sections */}
        {data && !showLoading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-chess-muted">
              <p>
                총{" "}
                <span className="text-chess-primary font-medium">
                  {data.total_openings}
                </span>
                개 오프닝 분석됨
              </p>
              {data.data_period && (
                <p>
                  <span className="text-chess-primary">
                    {data.data_period.replace("-", "년 ")}월
                  </span>{" "}
                  기준
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
        )}
      </div>

      <OpeningMovesModal
        entry={selectedOpening}
        onClose={() => setSelectedOpening(null)}
      />
    </main>
  );
}
