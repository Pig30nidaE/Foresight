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
    if (!username.trim()) return;
    router.push(
      `/dashboard?platform=${encodeURIComponent(platform)}&username=${encodeURIComponent(username.trim())}`
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 w-full max-w-xl"
    >
      {/*
        모바일: 이 div가 flex-row로 플랫폼 토글 + 입력을 한 줄에 배치
        PC(sm+): sm:contents → div가 사라지고 자식이 부모 flex에 직접 참여
      */}
      <div className="flex gap-2 sm:contents">
        {/* Platform Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
          {(["chess.com", "lichess"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors ${
                platform === p
                  ? "bg-chess-accent text-white"
                  : "bg-chess-surface text-chess-muted hover:text-chess-primary"
              }`}
            >
              {p === "chess.com" ? "Chess.com" : "Lichess"}
            </button>
          ))}
        </div>

        {/* Username Input */}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={typeof t === "function" ? t("dh.searchPlaceholder") : "유저명 입력"}
          className="flex-1 min-w-0 bg-chess-surface border border-chess-border rounded-lg px-4 py-2 text-chess-primary placeholder-chess-muted focus:outline-none focus:border-chess-accent transition-colors"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="w-full sm:w-auto bg-chess-accent hover:bg-chess-accent/80 text-white font-semibold px-6 py-2 rounded-lg transition-colors shrink-0"
      >
        {typeof t === "function" ? t("dh.startAnalysis") : "분석 시작 →"}
      </button>
    </form>
  );
}
