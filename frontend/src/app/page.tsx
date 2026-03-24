"use client";

import Link from "next/link";
import SearchForm from "@/shared/components/ui/SearchForm";
import { useTranslation } from "@/shared/lib/i18n";
import { DashboardPixelMascot } from "@/shared/components/ui/DashboardPixelMascot";
import PixelHudPanelChrome from "@/shared/components/ui/PixelHudPanelChrome";
import { PixelPawnGlyph } from "@/shared/components/ui/PixelGlyphs";

export default function Home() {
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-col items-center justify-start sm:justify-center min-h-[70vh] sm:min-h-[80vh] gap-8 sm:gap-10 text-center overflow-x-hidden pb-10 sm:pb-0">
      {/* Hero — JRPG title window */}
      <div className="flex flex-col items-center gap-4 sm:gap-5 animate-fade-in relative z-10 w-full shrink-0 pt-2 sm:pt-0 max-w-2xl mx-auto px-2">
        <div className="relative w-full pixel-frame pixel-hud-fill px-6 py-6 sm:px-8 sm:py-8">
          <PixelHudPanelChrome />
          <div className="absolute right-3 top-3 opacity-90" aria-hidden>
            <DashboardPixelMascot />
          </div>
          <span className="block mb-2 mx-auto select-none" aria-hidden>
            <PixelPawnGlyph className="opacity-90 text-chess-primary" size={48} />
          </span>
          <h1 className="font-pixel text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-wide text-chess-primary pixel-glitch-title leading-tight">
            <span className="text-chess-primary">foresight</span>
            <span className="text-chess-accent">-chess</span>
          </h1>
        </div>
      </div>

      {/* Search — HUD console */}
      <div className="relative z-10 w-full max-w-2xl mx-auto flex justify-center px-2 shrink-0">
        <div className="w-full pixel-frame pixel-hud-fill p-4 sm:p-5">
          <p className="font-pixel text-[11px] sm:text-xs text-chess-muted mb-3 text-left">
            {typeof t === "function" ? t("home.search") : "Search"}
          </p>
          <SearchForm />
        </div>
      </div>

      {/* Feature portals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl mt-1 sm:mt-2 relative z-10 shrink-0 px-1">
        <Link
          href="/opening-tier"
          className="group pixel-frame pixel-hud-fill p-4 sm:p-5 text-left transition-[filter] hover:brightness-[1.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-chess-accent"
        >
          <div className="font-pixel text-lg text-chess-accent mb-2">[ TIER ]</div>
          <h3 className="font-pixel text-base font-bold text-chess-primary group-hover:text-chess-accent">
            {t("home.openingTiers")}
          </h3>
          <p className="text-chess-muted text-sm mt-1.5 leading-relaxed">
            {t("home.openingTiersDesc")}
          </p>
        </Link>
        <Link
          href="/dashboard"
          className="group pixel-frame pixel-hud-fill p-4 sm:p-5 text-left transition-[filter] hover:brightness-[1.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-chess-accent"
        >
          <div className="font-pixel text-lg text-chess-accent mb-2">[ DATA ]</div>
          <h3 className="font-pixel text-base font-bold text-chess-primary group-hover:text-chess-accent">
            {t("home.search")}
          </h3>
          <p className="text-chess-muted text-sm mt-1.5 leading-relaxed">
            {t("home.searchDesc")}
          </p>
        </Link>
      </div>
    </div>
  );
}
