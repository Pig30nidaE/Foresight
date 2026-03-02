"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchForm() {
  const router = useRouter();
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
      {/* Platform Toggle */}
      <div className="flex rounded-lg overflow-hidden border border-zinc-700 shrink-0">
        {(["chess.com", "lichess"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              platform === p
                ? "bg-emerald-500 text-white"
                : "bg-zinc-900 text-zinc-400 hover:text-white"
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
        placeholder="유저명 입력 (예: MagnusCarlsen)"
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
      />

      {/* Submit */}
      <button
        type="submit"
        className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-6 py-2 rounded-lg transition-colors shrink-0"
      >
        분석 시작 →
      </button>
    </form>
  );
}
