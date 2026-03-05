import type { Tier } from "../types";
import { TIER_CONFIG } from "../types";

export default function TierBadge({ tier }: { tier: Tier }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md font-bold text-sm border ${cfg.color} ${cfg.bg} ${cfg.border}`}
    >
      {tier}
    </span>
  );
}
