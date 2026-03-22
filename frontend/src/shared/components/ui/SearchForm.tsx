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
        {/* 폼 상단 전체 너비 — 레이아웃에 반드시 높이 반영 (홈 하단 카드와 겹침 방지) */}
        {platform === "lichess" && (
          <div
            className="flex w-full flex-col gap-3 rounded-xl border border-amber-500/40 bg-chess-surface px-4 py-3 text-left shadow-sm sm:flex-row sm:items-center"
            role="status"
          >
            <span className="shrink-0 select-none text-2xl sm:self-start">🚧</span>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-sm font-bold text-chess-primary">{t("lichess.comingSoon.title")}</h3>
              <p className="text-xs leading-relaxed text-chess-muted sm:text-sm">{t("lichess.comingSoon.desc")}</p>
            </div>
          </div>
        )}

        {/* 토글 + 입력 + 제출: 모바일 세로, sm+ 한 줄 */}
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          {/*
            모바일: flex-row로 플랫폼 토글 + 입력 한 줄
            sm+: sm:contents → 토글·입력이 부모 flex-row에 직접 참여
          */}
          <div className="flex gap-2 sm:contents">
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-chess-border">
              {(["chess.com", "lichess"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                    platform === p
                      ? "bg-chess-accent text-white"
                      : "bg-chess-surface text-chess-muted hover:text-chess-primary"
                  }`}
                >
                  {p === "chess.com" ? "Chess.com" : "Lichess"}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={typeof t === "function" ? t("dh.searchPlaceholder") : "유저명 입력"}
              className="min-w-0 flex-1 rounded-lg border border-chess-border bg-chess-surface px-4 py-2 text-chess-primary placeholder-chess-muted transition-colors focus:border-chess-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={platform === "lichess"}
            className="w-full shrink-0 rounded-lg bg-chess-accent px-6 py-2 font-semibold text-white transition-colors hover:bg-chess-accent/80 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            {typeof t === "function" ? t("dh.startAnalysis") : "분석 시작 →"}
          </button>
        </div>
      </form>
    </div>
  );
}
