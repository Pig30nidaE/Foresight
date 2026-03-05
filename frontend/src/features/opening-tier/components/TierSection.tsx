"use client";

import { useState } from "react";
import type { Color, OpeningTierEntry, Tier } from "../types";
import { TIER_CONFIG } from "../types";
import TierBadge from "./TierBadge";
import OpeningTierTable from "./OpeningTierTable";

interface Props {
  tier: Tier;
  entries: OpeningTierEntry[];
  color: Color;
  defaultOpen?: boolean;
  onOpeningClick?: (entry: OpeningTierEntry) => void;
}

export default function TierSection({
  tier,
  entries,
  color,
  defaultOpen = false,
  onOpeningClick,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = TIER_CONFIG[tier];

  if (entries.length === 0) return null;

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-chess-border/20 transition-colors"
      >
        <TierBadge tier={tier} />
        <span className={`font-semibold ${cfg.color}`}>{tier} Tier</span>
        <span className="text-chess-muted text-sm">({entries.length}개)</span>
        <span className="ml-auto text-chess-muted text-sm">{open ? "▼" : "▶"}</span>
      </button>

      {open && (
        <div className="px-6 pb-5">
          <OpeningTierTable entries={entries} color={color} onOpeningClick={onOpeningClick} />
        </div>
      )}
    </div>
  );
}
