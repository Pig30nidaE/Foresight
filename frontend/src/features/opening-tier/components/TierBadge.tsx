import type { Tier } from "../types";
import { TIER_CONFIG } from "../types";

export default function TierBadge({ tier }: { tier: Tier }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 px-1 font-pixel text-sm font-bold border-2 ${cfg.color} ${cfg.bg} ${cfg.border} shadow-[inset_1px_1px_0_rgba(255,255,255,0.15),2px_2px_0_rgba(0,0,0,0.15)] dark:shadow-[inset_1px_1px_0_rgba(255,255,255,0.08),2px_2px_0_rgba(0,0,0,0.4)] rounded-[var(--pixel-radius)]`}
    >
      {tier}
    </span>
  );
}
