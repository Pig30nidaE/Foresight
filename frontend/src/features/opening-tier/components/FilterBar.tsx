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
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center pixel-frame pixel-hud-fill p-4 sm:p-5">
      <div className="flex w-full overflow-hidden border-2 border-chess-border sm:w-auto sm:shrink-0">
        {TIME_CLASSES.map((tc) => (
          <button
            key={tc}
            type="button"
            onClick={() => onSpeedChange(tc)}
            className={`font-pixel min-h-[44px] flex-1 px-3 py-2.5 text-xs font-bold capitalize sm:min-h-0 sm:flex-none sm:py-2 ${
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
        className="pixel-input font-pixel min-h-[44px] w-full min-w-0 px-3 py-2.5 text-base text-chess-primary sm:min-h-0 sm:min-w-[10rem] sm:text-sm"
      >
        {brackets.map((b) => (
          <option key={b.lichess_rating} value={b.lichess_rating}>
            {b.label_chesscom}
          </option>
        ))}
      </select>

      <div className="flex w-full overflow-hidden border-2 border-chess-border sm:w-auto sm:shrink-0">
        {(["white", "black"] as Color[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className={`font-pixel min-h-[44px] flex-1 px-4 py-2.5 text-xs font-bold sm:min-h-0 sm:flex-none sm:py-2 ${
              color === c
                ? c === "white"
                  ? "bg-amber-200 text-slate-900 ring-2 ring-slate-900 dark:bg-slate-100 dark:ring-chess-accent"
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
