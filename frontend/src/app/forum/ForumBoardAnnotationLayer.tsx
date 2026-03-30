"use client";

import type { BoardAnnotations } from "@/shared/lib/forumBoardAnnotations";
import { FORUM_ANNOTATION_SYMBOL_COLORS } from "@/shared/lib/forumBoardAnnotations";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS_DESC = [8, 7, 6, 5, 4, 3, 2, 1] as const;

type ForumBoardAnnotationLayerProps = {
  annotations: BoardAnnotations;
  onSquareClick?: (square: string) => void;
  className?: string;
};

export default function ForumBoardAnnotationLayer({
  annotations,
  onSquareClick,
  className = "",
}: ForumBoardAnnotationLayerProps) {
  const interactive = Boolean(onSquareClick);

  return (
    <div
      className={`pointer-events-none absolute inset-0 grid grid-cols-8 grid-rows-8 ${className}`}
      aria-hidden={!interactive}
    >
      {RANKS_DESC.map((rank) =>
        FILES.map((file) => {
          const square = `${file}${rank}`;
          const emoji = annotations.emojis[square];
          const symbolColor = emoji ? FORUM_ANNOTATION_SYMBOL_COLORS[emoji] : undefined;
          return (
            <div
              key={square}
              className={`relative min-h-0 min-w-0 ${interactive ? "pointer-events-auto cursor-pointer" : ""}`}
              onClick={interactive ? () => onSquareClick?.(square) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSquareClick?.(square);
                      }
                    }
                  : undefined
              }
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
            >
              {emoji ? (
                <span
                  className={`pointer-events-none absolute right-0 top-0 z-[2] max-w-[92%] translate-x-px translate-y-px truncate px-0.5 text-right font-black leading-none tracking-tight ${
                    symbolColor ? "" : "text-amber-100 dark:text-amber-200"
                  }`}
                  style={{
                    fontFamily: "system-ui,Segoe UI,Roboto,sans-serif",
                    fontSize: "clamp(11px, 3.8vmin, 20px)",
                    color: symbolColor,
                    textShadow: symbolColor
                      ? "0 0 1px #000,0 1px 2px #000,1px 0 0 #000,-1px 0 0 #000"
                      : "0 0 2px #000,0 1px 3px #000,1px 0 0 #000,-1px 0 0 #000,0 -1px 0 #000",
                  }}
                >
                  {emoji}
                </span>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
