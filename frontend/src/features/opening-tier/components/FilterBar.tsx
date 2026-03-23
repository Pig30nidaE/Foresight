"use client";

import type { TimeClass } from "@/shared/types";
import type { Color, RatingBracket } from "../types";

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

interface Props {
  speed: TimeClass;
  onSpeedChange: (s: TimeClass) => void;
  rating: number;
  onRatingChange: (r: number) => void;
  color: Color;
  onColorChange: (c: Color) => void;
  brackets: RatingBracket[];
}

export default function FilterBar({
  speed,
  onSpeedChange,
  rating,
  onRatingChange,
  color,
  onColorChange,
  brackets,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-center bg-chess-surface/60 dark:bg-chess-elevated/20 border border-chess-border/80 dark:border-chess-border rounded-2xl p-5">
      {/* Time control */}
      <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
        {TIME_CLASSES.map((tc) => (
          <button
            key={tc}
            type="button"
            onClick={() => onSpeedChange(tc)}
            className={`px-3 py-2 text-sm capitalize transition-colors ${
              speed === tc
                ? "bg-chess-inverse text-white"
                : "bg-chess-surface dark:bg-chess-bg/60 text-chess-muted hover:text-chess-primary"
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
        className="bg-chess-surface dark:bg-chess-bg border border-chess-border rounded-lg px-3 py-2 text-chess-primary text-sm focus:outline-none focus:ring-2 focus:ring-chess-accent/25 focus:border-chess-accent transition-colors"
      >
        {brackets.map((b) => (
          <option key={b.lichess_rating} value={b.lichess_rating}>
            {b.label_chesscom}
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
                  ? "bg-chess-bg dark:bg-chess-elevated text-chess-primary shadow-sm"
                  : "bg-chess-inverse text-white shadow-sm"
                : "bg-chess-surface dark:bg-chess-bg/60 text-chess-muted hover:text-chess-primary"
            }`}
          >
            {c === "white" ? "⬜ White" : "⬛ Black"}
          </button>
        ))}
      </div>
    </div>
  );
}
