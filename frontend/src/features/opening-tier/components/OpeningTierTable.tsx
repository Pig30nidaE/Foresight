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
  const winColor = color === "white" ? "bg-chess-primary/60" : "bg-chess-primary";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex rounded-sm overflow-hidden h-2 min-w-32">
        <div className={winColor} style={{ width: `${win}%` }} />
        <div className="bg-chess-muted/50" style={{ width: `${draw}%` }} />
        <div className="bg-red-800/60" style={{ width: `${loss}%` }} />
      </div>
      <div className="flex gap-2 tabular-nums text-[10px] leading-none">
        <span className={color === "white" ? "text-chess-primary/80" : "text-chess-primary"}>
          W {win}%
        </span>
        <span className="text-chess-muted">D {draw}%</span>
        <span className="text-red-400/80">L {loss}%</span>
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
    <div className="overflow-x-auto">
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
  );
}
