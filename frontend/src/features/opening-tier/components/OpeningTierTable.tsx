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
  const winBg = color === "white" ? "var(--color-chess-piece-w)" : "var(--color-chess-piece-b)";
  const dither = "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.14) 2px, rgba(0,0,0,0.14) 3px)";
  const ditherDraw = "repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex overflow-hidden h-2.5 min-w-24 sm:min-w-32 border-2 border-chess-border bg-chess-bg">
        <div
          style={{
            width: `${win}%`,
            backgroundColor: winBg,
            backgroundImage: dither,
          }}
        />
        <div
          style={{
            width: `${draw}%`,
            backgroundColor: "color-mix(in srgb, var(--color-chess-muted) 45%, var(--color-chess-border))",
            backgroundImage: ditherDraw,
          }}
        />
        <div
          className="bg-red-700/75 dark:bg-red-600/55"
          style={{
            width: `${loss}%`,
            backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px)`,
          }}
        />
      </div>
      <div className="flex gap-2 tabular-nums text-[10px] leading-none font-pixel">
        <span className={color === "white" ? "text-chess-primary/85" : "text-chess-primary"}>
          W {win}%
        </span>
        <span className="text-chess-muted">D {draw}%</span>
        <span className="text-chess-loss">L {loss}%</span>
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
      <div className="sm:hidden space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.eco}
            className="flex flex-col gap-2 px-3 py-2.5 pixel-frame pixel-hud-fill hover:brightness-[1.02] transition-[filter]"
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <TierBadge tier={entry.tier} />
              </div>

              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpeningClick?.(entry)}
                  className="font-pixel text-chess-primary hover:text-chess-accent text-sm font-bold text-left w-full line-clamp-2 break-words [overflow-wrap:anywhere]"
                >
                  {entry.name}
                </button>
                <span className="text-sm text-chess-muted font-mono">{entry.eco}</span>
              </div>
            </div>

            <div className="pl-12">
              <WinRateBar winRate={entry.win_rate} drawRate={entry.draw_rate} color={color} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto border-2 border-chess-border/50 bg-chess-bg/30 dark:bg-chess-bg/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-chess-muted font-pixel text-[11px] border-b-2 border-chess-border bg-chess-surface/40 dark:bg-chess-elevated/30">
              <th className="text-left py-2.5 px-3 font-bold">{t("tier.tableTier")}</th>
              <th className="text-left py-2.5 pr-3 font-bold">{t("tier.tableEco")}</th>
              <th className="text-left py-2.5 pr-3 font-bold">{t("tier.tableOpening")}</th>
              <th className="text-left py-2.5 pr-3 font-bold min-w-36">{t("tier.tableWinRate")}</th>
              <th className="text-right py-2.5 px-3 font-bold">{t("tier.tableTotalGames")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.eco}
                className="border-b border-chess-border/40 hover:bg-chess-surface/35 dark:hover:bg-chess-elevated/20 transition-colors"
              >
                <td className="py-2.5 px-3">
                  <TierBadge tier={entry.tier} />
                </td>
                <td className="py-2.5 pr-3 font-mono text-xs text-chess-muted">
                  {entry.eco}
                </td>
                <td className="py-2.5 pr-3 max-w-xs">
                  <button
                    type="button"
                    onClick={() => onOpeningClick?.(entry)}
                    className="font-pixel text-xs font-bold text-chess-primary hover:text-chess-accent truncate text-left"
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
                <td className="py-2.5 px-3 text-right text-chess-muted tabular-nums text-xs font-mono">
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
