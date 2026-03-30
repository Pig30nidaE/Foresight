"use client";

import { useState } from "react";
import type { Color, OpeningTierEntry, Tier } from "../types";
import { TIER_CONFIG } from "../types";
import TierBadge from "./TierBadge";
import OpeningTierTable from "./OpeningTierTable";
import { useTranslation } from "@/shared/lib/i18n";

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
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const cfg = TIER_CONFIG[tier];

  if (entries.length === 0) return null;

  return (
    <div className={`pixel-frame overflow-hidden ${cfg.border} ${cfg.bg}`}>
      <div className={`${cfg.bg} border-b-2 ${cfg.border}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 text-left transition-[filter] hover:brightness-[1.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          <TierBadge tier={tier} />
          <span className={`font-pixel text-sm font-bold ${cfg.color}`}>{tier} Tier</span>
          <span className="text-chess-muted text-xs sm:text-sm font-medium">
            {t("tier.count").replace("{n}", String(entries.length))}
          </span>
          <span className="ml-auto font-pixel text-chess-muted text-xs">{open ? "v" : ">"}</span>
        </button>
      </div>

      {open && (
        <div className="pixel-hud-fill px-4 sm:px-6 pb-4 sm:pb-5 pt-3 border-t-2 border-chess-border/40">
          <OpeningTierTable entries={entries} color={color} onOpeningClick={onOpeningClick} />
        </div>
      )}
    </div>
  );
}
