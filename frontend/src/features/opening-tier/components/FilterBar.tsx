"use client";

import type { TimeClass } from "@/shared/types";
import type { Color, RatingBracket } from "../types";

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

interface Props {
  platform: "lichess" | "chess.com";
  onPlatformChange: (p: "lichess" | "chess.com") => void;
  speed: TimeClass;
  onSpeedChange: (s: TimeClass) => void;
  rating: number;
  onRatingChange: (r: number) => void;
  color: Color;
  onColorChange: (c: Color) => void;
  brackets: RatingBracket[];
}

export default function FilterBar({
  platform,
  onPlatformChange,
  speed,
  onSpeedChange,
  rating,
  onRatingChange,
  color,
  onColorChange,
  brackets,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-center bg-chess-surface/60 border border-chess-border rounded-2xl p-5">
      {/* Platform toggle (레이팅 라벨 전환용) */}
      <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
        {(["lichess", "chess.com"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPlatformChange(p)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              platform === p
                ? "bg-chess-accent text-white"
                : "bg-chess-surface text-chess-muted hover:text-chess-primary"
            }`}
          >
            {p === "lichess" ? "Lichess" : "Chess.com"}
          </button>
        ))}
      </div>

      {/* Time control */}
      <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
        {TIME_CLASSES.map((tc) => (
          <button
            key={tc}
            type="button"
            onClick={() => onSpeedChange(tc)}
            className={`px-3 py-2 text-sm capitalize transition-colors ${
              speed === tc
                ? "bg-chess-primary text-white"
                : "bg-chess-surface text-chess-muted hover:text-chess-primary"
            }`}
          >
            {tc}
          </button>
        ))}
      </div>

      {/* Rating bracket */}
      <select
        value={rating}
        onChange={(e) => onRatingChange(Number(e.target.value))}
        className="bg-chess-surface border border-chess-border rounded-lg px-3 py-2 text-chess-primary text-sm focus:outline-none focus:border-chess-accent transition-colors"
      >
        {brackets.map((b) => (
          <option key={b.lichess_rating} value={b.lichess_rating}>
            {platform === "lichess" ? b.label_lichess : b.label_chesscom}
          </option>
        ))}
      </select>

      {/* Color toggle */}
      <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
        {(["white", "black"] as Color[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              color === c
                ? c === "white"
                  ? "bg-chess-bg text-chess-primary"
                  : "bg-chess-primary text-white"
                : "bg-chess-surface text-chess-muted hover:text-chess-primary"
            }`}
          >
            {c === "white" ? "⬜ White" : "⬛ Black"}
          </button>
        ))}
      </div>
    </div>
  );
}
