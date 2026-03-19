"use client";

import Link from "next/link";
import SearchForm from "@/shared/components/ui/SearchForm";
import { useTranslation } from "@/shared/lib/i18n";

export default function Home() {
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] gap-12 text-center overflow-hidden">
      {/* Dot-grid background */}
      <div className="absolute inset-0 dot-grid opacity-[0.15] pointer-events-none" />

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 animate-fade-in relative z-10">
        <span className="text-7xl select-none">♟️</span>
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-chess-primary">Fore</span>
          <span className="text-chess-accent">sight</span>
        </h1>
        <p className="text-chess-muted text-lg max-w-md leading-relaxed">
          {t("home.desc1")}
          <br />
          {t("home.desc2")}
        </p>
      </div>

      {/* Search */}
      <div className="relative z-10 w-full flex justify-center">
        <SearchForm />
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mt-4 relative z-10">
        <Link
          href="/opening-tier"
          className="bg-chess-surface/80 backdrop-blur-sm border border-chess-border rounded-xl p-5 text-left hover:border-chess-accent/60 hover:bg-chess-border/60 transition-all group"
        >
          <div className="text-2xl mb-3">📋</div>
          <h3 className="font-semibold text-chess-primary group-hover:text-chess-accent transition-colors">
            {t("home.openingTiers")}
          </h3>
          <p className="text-chess-muted text-sm mt-1">
            {t("home.openingTiersDesc")}
          </p>
        </Link>
        <Link
          href="/dashboard"
          className="bg-chess-surface/80 backdrop-blur-sm border border-chess-border rounded-xl p-5 text-left hover:border-chess-accent/60 hover:bg-chess-border/60 transition-all group"
        >
          <div className="text-2xl mb-3">🎯</div>
          <h3 className="font-semibold text-chess-primary group-hover:text-chess-accent transition-colors">
            {t("home.search")}
          </h3>
          <p className="text-chess-muted text-sm mt-1">
            {t("home.searchDesc")}
          </p>
        </Link>
      </div>
    </div>
  );
}
