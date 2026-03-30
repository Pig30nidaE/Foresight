/**
 * 섹션 헤더 컴포넌트 — 제목 + 설명 + 로딩 퍼센트 진행률
 */
"use client";

import { useLoadingProgress } from "@/hooks/useLoadingProgress";
import { useTranslation } from "@/shared/lib/i18n";
import { PixelStickerFace } from "@/shared/components/ui/PixelHudIcons";

export type SectionSticker = "HOT" | "LOL" | "RIP" | "MVP";

interface Props {
  title: string;
  desc?: string;
  isLoading?: boolean;
  progressPercent?: number;
  /** Decorative only (dashboard). */
  decorationSticker?: SectionSticker;
}

export default function SectionHeader({
  title,
  desc,
  isLoading = false,
  progressPercent,
  decorationSticker,
}: Props) {
  const { t } = useTranslation();
  const pct = useLoadingProgress(isLoading, progressPercent);
  const showBar = pct > 0;
  const segments = 20;
  const filled = Math.round((pct / 100) * segments);

  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="font-pixel text-xl md:text-2xl font-bold text-chess-primary leading-tight pixel-glitch-title tracking-wide">
          {title}
        </h2>
        {decorationSticker && (
          <span className="pixel-sticker" aria-hidden>
            <PixelStickerFace kind={decorationSticker} />
            {decorationSticker}
          </span>
        )}
        {isLoading && (
          <span className="font-pixel flex items-center gap-1.5 text-[12px] text-chess-primary border-2 border-chess-border bg-chess-surface px-2 py-0.5 shadow-[2px_2px_0_rgba(0,0,0,0.12)]">
            <span className="inline-grid grid-cols-2 gap-px w-3 h-3" aria-hidden>
              <span className="bg-chess-accent" />
              <span className="bg-chess-muted/40" />
              <span className="bg-chess-muted/40" />
              <span className="bg-chess-accent animate-pulse" />
            </span>
            {typeof t === "function" ? t("dh.loading") : "Loading..."}
          </span>
        )}
      </div>

      {desc && (
        <p className="text-chess-primary/78 dark:text-chess-muted text-sm mt-1.5 leading-relaxed">{desc}</p>
      )}

      {showBar && (
        <div className="mt-3 flex items-center gap-2">
          <div
            className="pixel-progress-track flex-1 min-w-0"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {Array.from({ length: segments }, (_, i) => (
              <div
                key={i}
                className={`min-w-0 flex-1 ${i < filled ? "bg-chess-accent" : "bg-chess-border/45 dark:bg-chess-border/35"}`}
                style={{ imageRendering: "pixelated" }}
              />
            ))}
          </div>
          <span className="font-pixel text-[12px] tabular-nums text-chess-muted w-9 text-right leading-none shrink-0">
            {pct}%
          </span>
        </div>
      )}
    </div>
  );
}
