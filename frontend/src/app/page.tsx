"use client";

import SearchForm from "@/shared/components/ui/SearchForm";
import { useTranslation } from "@/shared/lib/i18n";
import { PixelPawnGlyph } from "@/shared/components/ui/PixelGlyphs";

export default function Home() {
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-col items-center justify-start sm:justify-center min-h-[70vh] sm:min-h-[80vh] gap-8 sm:gap-10 text-center overflow-x-hidden pb-10 sm:pb-0">
      {/* Hero — JRPG title window */}
      <div className="flex flex-col items-center gap-4 sm:gap-5 animate-fade-in relative z-10 w-full shrink-0 pt-2 sm:pt-0 max-w-3xl mx-auto px-2">
        <div className="relative w-full px-2 py-3 sm:px-4 sm:py-5">
          <span className="block mb-2 mx-auto select-none" aria-hidden>
            <PixelPawnGlyph className="opacity-90 text-chess-primary" size={84} />
          </span>
          <h1 className="font-pixel text-[30rem] sm:text-[36rem] md:text-[48rem] lg:text-[64rem] font-bold tracking-wide text-chess-primary pixel-glitch-title leading-tight">
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

    </div>
  );
}
