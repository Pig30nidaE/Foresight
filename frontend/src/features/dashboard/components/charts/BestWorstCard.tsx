"use client";

import type { BestWorstOpenings } from "@/types";
import { useTranslation } from "@/shared/lib/i18n";

interface Props {
  data: BestWorstOpenings;
}

export default function BestWorstCard({ data }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {/* Best */}
      {data.best ? (
        <div className="rounded-xl border border-chess-win/35 bg-chess-win/8 dark:bg-chess-win/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-chess-win inline-block" />
            <span className="text-xs font-bold text-chess-win uppercase tracking-wider">
              {t("chart.bestOpening")}
            </span>
          </div>
          <p className="text-chess-primary font-semibold leading-snug">{data.best.name}</p>
          <p className="text-chess-muted text-xs font-mono mt-0.5">{data.best.eco}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-chess-win">{data.best.win_rate}%</span>
            <span className="text-chess-muted text-sm">{t("chart.winRateGames").replace("{n}", String(data.best.games))}</span>
          </div>
        </div>
      ) : (
        <div className="bg-chess-bg border border-chess-border rounded-xl p-4 text-chess-muted text-sm">
          {t("chart.notEnoughData")}
        </div>
      )}

      {/* Worst */}
      {data.worst ? (
        <div className="rounded-xl border border-chess-loss/35 bg-chess-loss/8 dark:bg-chess-loss/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-chess-loss inline-block" />
            <span className="text-xs font-bold text-chess-loss uppercase tracking-wider">
              {t("chart.worstOpening")}
            </span>
          </div>
          <p className="text-chess-primary font-semibold leading-snug">{data.worst.name}</p>
          <p className="text-chess-muted text-xs font-mono mt-0.5">{data.worst.eco}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-chess-loss">{data.worst.win_rate}%</span>
            <span className="text-chess-muted text-sm">{t("chart.winRateGames").replace("{n}", String(data.worst.games))}</span>
          </div>
          <p className="text-xs text-chess-loss/70 mt-2">{t("chart.worstOpeningTip")}</p>
        </div>
      ) : null}
    </div>
  );
}
