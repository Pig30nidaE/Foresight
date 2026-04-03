"use client";

import { useMemo } from "react";
import { Chessboard } from "react-chessboard";

import ForumBoardAnnotationLayer from "@/features/forum/components/ForumBoardAnnotationLayer";
import { normalizeFenForDisplay, positionsFromPgnText } from "@/shared/lib/forumChess";
import {
  highlightsToSquareStyles,
  mergeAnnotationsForReplayIndex,
  normalizeBoardAnnotationsFromApi,
} from "@/shared/lib/forumBoardAnnotations";

const PLACEHOLDER_SRC = "/forum/thumbnail.svg";

/** 작은 셀(목록·게시판 행): 좌표가 칸 대비 과도하게 크지 않게 */
const THUMB_NOTATION_ALPHA_COMPACT = {
  fontSize: "8px",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "500",
  position: "absolute" as const,
  bottom: 1,
  right: 2,
  userSelect: "none" as const,
  lineHeight: 1,
};
const THUMB_NOTATION_NUMERIC_COMPACT = {
  fontSize: "8px",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "500",
  position: "absolute" as const,
  top: 1,
  left: 1,
  userSelect: "none" as const,
  lineHeight: 1,
};

/** 상세 등 큰 보드: vmin으로 모바일에서도 칸에 맞게 상한 */
const THUMB_NOTATION_ALPHA_NORMAL = {
  fontSize: "clamp(10px, 2.4vmin, 13px)",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "600",
  position: "absolute" as const,
  bottom: 2,
  right: 4,
  userSelect: "none" as const,
  lineHeight: 1.2,
};
const THUMB_NOTATION_NUMERIC_NORMAL = {
  fontSize: "clamp(10px, 2.4vmin, 13px)",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "600",
  position: "absolute" as const,
  top: 2,
  left: 2,
  userSelect: "none" as const,
  lineHeight: 1.2,
};

type ForumPostThumbnailProps = {
  thumbnailFen: string | null | undefined;
  /** 상세 등에서만 전달 (목록 썸네일은 생략 권장) */
  boardAnnotations?: unknown;
  /** PGN이 있으면 최종 국면에 맞는 byPly만 합성 (이모지가 끝 수에만 붙도록) */
  pgnText?: string | null;
  className?: string;
  /**
   * true면 보드가 포인터 이벤트를 받지 않음 — 부모 `button`/`Link`의 탭·클릭이 동작하도록
   * (모바일에서 Peek 카드 등)
   */
  nonInteractive?: boolean;
  /**
   * 목록·썸네일 등 작은 영역: a–h/1–8을 작게 (기본 false = 상세용 clamp)
   */
  compactNotation?: boolean;
};

/**
 * 부모는 반드시 `relative`이고 높이가 정해져 있어야 합니다 (예: `aspect-square w-full`).
 * 이 컴포넌트는 `absolute inset-0`으로 영역을 채웁니다.
 */
export default function ForumPostThumbnail({
  thumbnailFen,
  boardAnnotations,
  pgnText = null,
  className,
  nonInteractive = false,
  compactNotation = false,
}: ForumPostThumbnailProps) {
  const fen = normalizeFenForDisplay(thumbnailFen);
  const finalReplayIndex = useMemo(() => {
    const pos = positionsFromPgnText(pgnText?.trim() ?? "");
    if (pos && pos.length >= 2) return pos.length - 1;
    return 0;
  }, [pgnText]);
  const ann = useMemo(() => {
    const raw = normalizeBoardAnnotationsFromApi(boardAnnotations);
    return mergeAnnotationsForReplayIndex(raw, finalReplayIndex);
  }, [boardAnnotations, finalReplayIndex]);
  const squareStyles = useMemo(() => highlightsToSquareStyles(ann.highlights), [ann.highlights]);

  const noPointer = nonInteractive ? "pointer-events-none [&_*]:pointer-events-none" : "";

  const alphaNotation = compactNotation ? THUMB_NOTATION_ALPHA_COMPACT : THUMB_NOTATION_ALPHA_NORMAL;
  const numericNotation = compactNotation ? THUMB_NOTATION_NUMERIC_COMPACT : THUMB_NOTATION_NUMERIC_NORMAL;

  return (
    <div
      className={`absolute inset-0 min-h-0 min-w-0 bg-chess-surface ${noPointer} ${className ?? ""}`}
    >
      {fen ? (
        <div className={`relative h-full w-full overflow-hidden rounded-lg ${noPointer}`}>
          <Chessboard
            options={{
              position: fen,
              allowDragging: false,
              showAnimations: false,
              animationDurationInMs: 0,
              boardOrientation: "white",
              showNotation: true,
              alphaNotationStyle: alphaNotation,
              numericNotationStyle: numericNotation,
              squareStyles,
              boardStyle: {
                width: "100%",
                height: "100%",
                borderRadius: "8px",
                boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
              },
            }}
          />
          {Object.keys(ann.emojis).length > 0 ? (
            <ForumBoardAnnotationLayer annotations={ann} className="z-[1]" />
          ) : null}
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PLACEHOLDER_SRC} alt="" className="h-full w-full object-cover" />
        </>
      )}
    </div>
  );
}
