"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";

import ForumBoardAnnotationLayer from "@/features/forum/components/ForumBoardAnnotationLayer";
import { positionsFromPgnText } from "@/shared/lib/forumChess";
import {
  highlightsToSquareStyles,
  mergeAnnotationsForReplayIndex,
  normalizeBoardAnnotationsFromApi,
} from "@/shared/lib/forumBoardAnnotations";
import { useTranslation } from "@/shared/lib/i18n";

/** 글 상세 재생: 보드 크기에 비례해 좌표 크기 상한 (모바일에서 과대 방지) */
const REPLAY_NOTATION_ALPHA_DEFAULT = {
  fontSize: "clamp(10px, 2.5vmin, 14px)",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "600",
  position: "absolute" as const,
  bottom: 2,
  right: 4,
  userSelect: "none" as const,
  lineHeight: 1.2,
};
const REPLAY_NOTATION_NUMERIC_DEFAULT = {
  fontSize: "clamp(10px, 2.5vmin, 14px)",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "600",
  position: "absolute" as const,
  top: 2,
  left: 2,
  userSelect: "none" as const,
  lineHeight: 1.2,
};

/** 포럼 그리드 카드 등 좁은 보드 */
const REPLAY_NOTATION_ALPHA_CARD = {
  fontSize: "8px",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "500",
  position: "absolute" as const,
  bottom: 1,
  right: 2,
  userSelect: "none" as const,
  lineHeight: 1,
};
const REPLAY_NOTATION_NUMERIC_CARD = {
  fontSize: "8px",
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  fontWeight: "500",
  position: "absolute" as const,
  top: 1,
  left: 1,
  userSelect: "none" as const,
  lineHeight: 1,
};

type ForumPgnReplayProps = {
  pgnText: string;
  boardAnnotations?: unknown;
  className?: string;
  /** 목록 카드 등 좁은 영역: 헤더·원문 PGN 접기 생략, 높이 채움 */
  variant?: "default" | "card";
  /** `variant="card"`일 때 보드 영역 클릭 시 글 상세로 이동 (재생 버튼은 그대로 동작) */
  postHref?: string;
};

export default function ForumPgnReplay({
  pgnText,
  boardAnnotations,
  className,
  variant = "default",
  postHref,
}: ForumPgnReplayProps) {
  const { t } = useTranslation();
  const isCard = variant === "card";
  const positions = useMemo(() => positionsFromPgnText(pgnText), [pgnText]);
  const annBase = useMemo(() => normalizeBoardAnnotationsFromApi(boardAnnotations), [boardAnnotations]);
  const [idx, setIdx] = useState(0);
  const ann = useMemo(() => mergeAnnotationsForReplayIndex(annBase, idx), [annBase, idx]);
  const squareStyles = useMemo(() => highlightsToSquareStyles(ann.highlights), [ann.highlights]);

  const canReplay = Boolean(positions && positions.length >= 2);
  const max = canReplay ? positions!.length - 1 : 0;

  useEffect(() => {
    setIdx(0);
  }, [positions]);

  useEffect(() => {
    setIdx((i) => Math.min(i, max));
  }, [max]);

  useEffect(() => {
    if (!positions || positions.length < 2) return;
    const cap = positions.length - 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, cap));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [positions]);

  if (!canReplay || !positions) return null;

  const currentFen = positions[idx]!.fen;
  const sanMoves = positions.slice(1).map((p) => p.san);

  const frameClass = isCard
    ? `flex h-full min-h-0 w-full min-w-0 flex-col bg-chess-surface/90 font-sans antialiased dark:bg-chess-elevated/35 ${className ?? ""}`
    : `pixel-frame bg-chess-surface/45 p-3 font-sans antialiased dark:bg-chess-elevated/25 ${className ?? ""}`;

  const ctrlBtn =
    "rounded-md border border-chess-border bg-chess-surface/80 px-2 py-1.5 text-base font-semibold text-chess-primary disabled:opacity-30 sm:px-3 sm:py-2 sm:text-[1.0625rem]";
  const idxLabel = "min-w-[4rem] text-center text-base tabular-nums text-chess-muted sm:min-w-[4.5rem] sm:text-[1.0625rem]";

  return (
    <div className={frameClass}>
      {!isCard && (
        <p className="text-sm font-semibold text-chess-muted sm:text-base">{t("forum.replay.title")}</p>
      )}
      <div
        className={
          isCard
            ? "mx-auto mt-0 flex min-h-0 w-full flex-1 flex-col items-center px-0.5 pb-1 pt-0.5"
            : "mx-auto mt-2 flex w-full max-w-sm flex-col items-center sm:max-w-md"
        }
      >
        <div
          className={
            isCard
              ? "relative aspect-square w-full min-h-0 max-w-full shrink-0 overflow-hidden rounded-lg ring-1 ring-chess-border/50"
              : "relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-chess-border/50"
          }
        >
          <div className="absolute inset-0 min-h-0 min-w-0">
            <Chessboard
              options={{
                position: currentFen,
                allowDragging: false,
                showAnimations: true,
                animationDurationInMs: 220,
                boardOrientation: "white",
                showNotation: true,
                alphaNotationStyle: isCard ? REPLAY_NOTATION_ALPHA_CARD : REPLAY_NOTATION_ALPHA_DEFAULT,
                numericNotationStyle: isCard ? REPLAY_NOTATION_NUMERIC_CARD : REPLAY_NOTATION_NUMERIC_DEFAULT,
                squareStyles,
                boardStyle: {
                  width: "100%",
                  height: "100%",
                  borderRadius: "8px",
                  boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
                },
              }}
            />
          </div>
          {Object.keys(ann.emojis).length > 0 ? (
            <ForumBoardAnnotationLayer annotations={ann} className="z-[1]" />
          ) : null}
          {isCard && postHref ? (
            <Link
              href={postHref}
              className="absolute inset-0 z-[2] block rounded-lg focus-visible:outline focus-visible:ring-2 focus-visible:ring-chess-accent focus-visible:ring-offset-2"
              aria-label={t("forum.aria.openPostFromThumbnail")}
            >
              <span className="sr-only">{t("forum.aria.openPostFromThumbnail")}</span>
            </Link>
          ) : null}
        </div>

        <div className={`flex flex-wrap items-center justify-center gap-1 ${isCard ? "mt-1" : "mt-3"}`}>
          <button type="button" onClick={() => setIdx(0)} disabled={idx === 0} className={ctrlBtn}>
            |&lt;
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(i - 1, 0))}
            disabled={idx === 0}
            className={ctrlBtn}
          >
            &lt;
          </button>
          <span className={idxLabel}>
            {idx}/{max}
          </span>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(i + 1, max))}
            disabled={idx === max}
            className={ctrlBtn}
          >
            &gt;
          </button>
          <button type="button" onClick={() => setIdx(max)} disabled={idx === max} className={ctrlBtn}>
            &gt;|
          </button>
        </div>

        {!isCard && (
          <div className="mt-3 flex max-h-[min(40vh,14rem)] w-full flex-wrap justify-center gap-1.5 overflow-y-auto px-0.5">
            {sanMoves.map((san, i) => {
              const step = i + 1;
              const active = step === idx;
              return (
                <button
                  key={`${i}-${san}`}
                  type="button"
                  onClick={() => setIdx(step)}
                  className={`min-h-[44px] min-w-[2.75rem] touch-manipulation rounded-md border px-2.5 py-2 text-base font-semibold leading-tight sm:min-h-0 sm:px-3 sm:py-2 sm:text-[1.0625rem] ${
                    active
                      ? "border-chess-accent bg-chess-accent/15 text-chess-accent"
                      : "border-chess-border bg-chess-surface/60 text-chess-primary"
                  }`}
                >
                  {san}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!isCard && (
        <details className="mt-4 border-t border-chess-border/40 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-chess-muted hover:text-chess-primary sm:text-base">
            {t("forum.replay.rawPgn")}
          </summary>
          <pre className="mt-3 max-h-[min(50vh,22rem)] overflow-auto break-words whitespace-pre-wrap font-mono text-[0.9375rem] leading-relaxed text-chess-primary sm:text-base [overflow-wrap:anywhere]">
            {pgnText.trim()}
          </pre>
        </details>
      )}
    </div>
  );
}
