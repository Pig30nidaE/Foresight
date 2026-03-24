"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/shared/lib/i18n";

export default function SearchForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<"chess.com" | "lichess">("chess.com");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || platform === "lichess") return;
    router.push(
      `/dashboard?platform=${encodeURIComponent(platform)}&username=${encodeURIComponent(username.trim())}`
    );
  };

  return (
    <div className="flex w-full max-w-xl shrink-0">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        {platform === "lichess" && (
          <div
            className="flex w-full flex-col gap-3 pixel-frame border-amber-600/50 bg-amber-500/10 px-4 py-3 text-left sm:flex-row sm:items-center"
            role="status"
          >
            <span className="shrink-0 select-none font-pixel text-xl sm:self-start text-amber-700 dark:text-amber-400">
              !!
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-pixel text-sm font-bold text-chess-primary">{t("lichess.comingSoon.title")}</h3>
              <p className="text-xs leading-relaxed text-chess-muted sm:text-sm">{t("lichess.comingSoon.desc")}</p>
            </div>
          </div>
        )}

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-2 sm:contents">
            <div className="flex shrink-0 overflow-hidden border-2 border-chess-border">
              {(["chess.com", "lichess"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`font-pixel px-3 py-2 text-xs sm:text-sm font-bold sm:px-4 ${
                    platform === p
                      ? "bg-chess-accent text-white border-chess-accent"
                      : "bg-chess-surface text-chess-muted hover:text-chess-primary"
                  }`}
                >
                  {p === "chess.com" ? "Chess.com" : "Lichess"}
                </button>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("dh.searchPlaceholder")}
                className="pixel-input font-pixel w-full px-4 py-2.5 text-base text-chess-primary placeholder:text-chess-muted/80"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={platform === "lichess"}
            className="font-pixel pixel-btn w-full shrink-0 bg-chess-inverse px-6 py-2.5 text-sm font-bold text-white hover:bg-chess-inverse/90 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            {t("dh.startAnalysis")}
          </button>
        </div>
      </form>
    </div>
  );
}
