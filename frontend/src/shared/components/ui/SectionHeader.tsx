/**
 * 섹션 헤더 컴포넌트 — 제목 + 설명 + 로딩 퍼센트 진행률
 */
"use client";

import { useLoadingProgress } from "@/hooks/useLoadingProgress";
import { useTranslation } from "@/shared/lib/i18n";

interface Props {
  title: string;
  desc?: string;
  isLoading?: boolean;
  progressPercent?: number;
}

export default function SectionHeader({ title, desc, isLoading = false, progressPercent }: Props) {
  const { t } = useTranslation();
  const pct = useLoadingProgress(isLoading, progressPercent);
  const showBar = pct > 0;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h2 className="text-xl font-bold text-chess-primary leading-tight">{title}</h2>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-[11px] text-chess-accent/80 bg-chess-accent/8 border border-chess-accent/20 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-chess-accent animate-pulse" />
            {typeof t === "function" ? t("dh.loading") : "Loading..."}
          </span>
        )}
      </div>

      {desc && (
        <p className="text-chess-primary/78 dark:text-chess-muted text-sm mt-1.5 leading-relaxed">{desc}</p>
      )}

      {showBar && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1 bg-chess-border rounded-full overflow-hidden">
            <div
              className="h-full bg-chess-accent rounded-full transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono tabular-nums text-chess-muted w-8 text-right leading-none">
            {pct}%
          </span>
        </div>
      )}
    </div>
  );
}
