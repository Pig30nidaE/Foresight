"use client";

import { Chessboard } from "react-chessboard";

import { normalizeFenForDisplay } from "@/shared/lib/forumChess";

const PLACEHOLDER_SRC = "/forum/thumbnail.svg";

type ForumPostThumbnailProps = {
  thumbnailFen: string | null | undefined;
  className?: string;
};

/**
 * 부모는 반드시 `relative`이고 높이가 정해져 있어야 합니다 (예: `aspect-square w-full`).
 * 이 컴포넌트는 `absolute inset-0`으로 영역을 채웁니다.
 */
export default function ForumPostThumbnail({ thumbnailFen, className }: ForumPostThumbnailProps) {
  const fen = normalizeFenForDisplay(thumbnailFen);

  return (
    <div className={`absolute inset-0 min-h-0 min-w-0 bg-chess-surface ${className ?? ""}`}>
      {fen ? (
        <Chessboard
          options={{
            position: fen,
            allowDragging: false,
            showAnimations: false,
            animationDurationInMs: 0,
            boardOrientation: "white",
            showNotation: false,
            boardStyle: {
              width: "100%",
              height: "100%",
              borderRadius: "8px",
              boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
            },
          }}
        />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PLACEHOLDER_SRC} alt="" className="h-full w-full object-cover" />
        </>
      )}
    </div>
  );
}
