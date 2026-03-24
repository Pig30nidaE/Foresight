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
    <div className="flex flex-wrap gap-3 items-center pixel-frame pixel-hud-fill p-4 sm:p-5">
      <div className="flex overflow-hidden border-2 border-chess-border shrink-0">
        {TIME_CLASSES.map((tc) => (
          <button
            key={tc}
            type="button"
            onClick={() => onSpeedChange(tc)}
            className={`font-pixel px-3 py-2 text-xs font-bold capitalize ${
              speed === tc
                ? "bg-chess-inverse text-white"
                : "bg-chess-surface dark:bg-chess-bg/60 text-chess-muted hover:text-chess-primary"
            }`}
          >
            {tc}
          </button>
        ))}
      </div>

      <select
        value={rating}
        onChange={(e) => onRatingChange(Number(e.target.value))}
        className="pixel-input font-pixel min-w-[10rem] px-3 py-2 text-chess-primary text-sm"
      >
        {brackets.map((b) => (
          <option key={b.lichess_rating} value={b.lichess_rating}>
            {b.label_chesscom}
          </option>
        ))}
      </select>

      <div className="flex overflow-hidden border-2 border-chess-border shrink-0">
        {(["white", "black"] as Color[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className={`font-pixel px-4 py-2 text-xs font-bold ${
              color === c
                ? c === "white"
                  ? "bg-chess-bg dark:bg-chess-elevated text-chess-primary"
                  : "bg-chess-inverse text-white"
                : "bg-chess-surface dark:bg-chess-bg/60 text-chess-muted hover:text-chess-primary"
            }`}
          >
            {c === "white" ? "WHT" : "BLK"}
          </button>
        ))}
      </div>
    </div>
  );
}
