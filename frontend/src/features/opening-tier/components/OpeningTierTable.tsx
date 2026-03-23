import type { Color, OpeningTierEntry } from "../types";
import TierBadge from "./TierBadge";
import { useTranslation } from "@/shared/lib/i18n";

function WinRateBar({
  winRate,
  drawRate,
  color,
}: {
  winRate: number;
  drawRate: number;
  color: Color;
}) {
  const win = Math.round(winRate * 100);
  const draw = Math.round(drawRate * 100);
  const loss = Math.max(0, 100 - win - draw);
  const winColor = color === "white" ? "bg-chess-piece-w" : "bg-chess-piece-b";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex rounded-sm overflow-hidden h-2 min-w-24 sm:min-w-32">
        <div className={winColor} style={{ width: `${win}%` }} />
        <div className="bg-chess-muted/50" style={{ width: `${draw}%` }} />
        <div className="bg-red-800/60 dark:bg-red-500/45" style={{ width: `${loss}%` }} />
      </div>
      <div className="flex gap-2 tabular-nums text-[10px] leading-none">
        <span className={color === "white" ? "text-chess-primary/80" : "text-chess-primary"}>
          W {win}%
        </span>
        <span className="text-chess-muted">D {draw}%</span>
        <span className="text-red-700 dark:text-red-400">L {loss}%</span>
      </div>
    </div>
  );
}

interface Props {
  entries: OpeningTierEntry[];
  color: Color;
  onOpeningClick?: (entry: OpeningTierEntry) => void;
}

export default function OpeningTierTable({ entries, color, onOpeningClick }: Props) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return <p className="text-chess-muted text-sm py-4">{t("tier.noOpenings")}</p>;
  }

  return (
    <>
      {/* ── 모바일: 카드 목록 (sm 미만) ── */}
      <div className="sm:hidden space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.eco}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-chess-border/50 bg-chess-surface/40 hover:bg-chess-border/20 transition-colors"
          >
            {/* 티어 배지 */}
            <div className="shrink-0">
              <TierBadge tier={entry.tier} />
            </div>

            {/* 오프닝명 + ECO */}
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => onOpeningClick?.(entry)}
                className="text-chess-primary hover:text-chess-accent text-sm font-medium text-left transition-colors w-full truncate block"
              >
                {entry.name}
              </button>
              <span className="text-[11px] text-chess-muted font-mono">{entry.eco}</span>
            </div>

            {/* 승률 바 */}
            <div className="shrink-0">
              <WinRateBar winRate={entry.win_rate} drawRate={entry.draw_rate} color={color} />
            </div>
          </div>
        ))}
      </div>

      {/* ── 데스크톱: 테이블 (sm 이상) ── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-chess-muted text-xs border-b border-chess-border">
              <th className="text-left py-2 pr-3 font-medium">{t("tier.tableTier")}</th>
              <th className="text-left py-2 pr-3 font-medium">{t("tier.tableEco")}</th>
              <th className="text-left py-2 pr-3 font-medium">{t("tier.tableOpening")}</th>
              <th className="text-left py-2 pr-3 font-medium min-w-36">{t("tier.tableWinRate")}</th>
              <th className="text-right py-2 font-medium">{t("tier.tableTotalGames")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.eco}
                className="border-b border-chess-border/50 hover:bg-chess-border/20 transition-colors"
              >
                <td className="py-2.5 pr-3">
                  <TierBadge tier={entry.tier} />
                </td>
                <td className="py-2.5 pr-3 font-mono text-xs text-chess-muted">
                  {entry.eco}
                </td>
                <td className="py-2.5 pr-3 max-w-xs">
                  <button
                    type="button"
                    onClick={() => onOpeningClick?.(entry)}
                    className="text-chess-primary hover:text-chess-accent truncate text-left transition-colors"
                  >
                    {entry.name}
                  </button>
                </td>
                <td className="py-2.5 pr-3 min-w-36">
                  <WinRateBar
                    winRate={entry.win_rate}
                    drawRate={entry.draw_rate}
                    color={color}
                  />
                </td>
                <td className="py-2.5 text-right text-chess-muted tabular-nums text-xs">
                  {entry.total_games.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
