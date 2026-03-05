import type { Color, OpeningTierEntry } from "../types";
import TierBadge from "./TierBadge";

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
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex rounded-sm overflow-hidden h-2 min-w-24">
        <div
          className={color === "white" ? "bg-chess-primary/60" : "bg-chess-primary"}
          style={{ width: `${win}%` }}
        />
        <div className="bg-chess-muted/50" style={{ width: `${draw}%` }} />
        <div className="bg-red-800/60" style={{ width: `${loss}%` }} />
      </div>
      <span className="text-xs text-chess-primary tabular-nums w-8 text-right">
        {win}%
      </span>
    </div>
  );
}

interface Props {
  entries: OpeningTierEntry[];
  color: Color;
  onOpeningClick?: (entry: OpeningTierEntry) => void;
}

export default function OpeningTierTable({ entries, color, onOpeningClick }: Props) {
  if (entries.length === 0) {
    return <p className="text-chess-muted text-sm py-4">오프닝 없음</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-chess-muted text-xs border-b border-chess-border">
            <th className="text-left py-2 pr-3 font-medium">등급</th>
            <th className="text-left py-2 pr-3 font-medium">ECO</th>
            <th className="text-left py-2 pr-3 font-medium">오프닝</th>
            <th className="text-left py-2 pr-3 font-medium min-w-36">승률</th>
            <th className="text-right py-2 font-medium">총 게임</th>
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
