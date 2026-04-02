"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { OpeningTierEntry, Color } from "../types";
import { getEcoMainIdeaBullets } from "../ecoMainIdeas";
import { getOpeningDescription } from "../openingDescriptions";
import { useTranslation } from "@/shared/lib/i18n";
import { useBodyScrollLock } from "@/shared/lib/useBodyScrollLock";

interface Props {
  entry: OpeningTierEntry | null;
  onClose: () => void;
  color?: Color;
}

interface Position {
  fen: string;
  san: string;
}

export default function OpeningMovesModal({ entry, onClose, color = "white" }: Props) {
  const { t, language } = useTranslation();
  useBodyScrollLock(!!entry);
  const [currentIndex, setCurrentIndex] = useState(0);

  const positions = useMemo((): Position[] | null => {
    if (!entry?.moves) return null;
    const game = new Chess();
    const result: Position[] = [{ fen: game.fen(), san: "" }];
    for (const uci of entry.moves) {
      try {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        const moveResult = game.move({ from, to, promotion });
        if (!moveResult) break;
        result.push({ fen: game.fen(), san: moveResult.san });
      } catch {
        break;
      }
    }
    return result;
  }, [entry]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [entry]);

  useEffect(() => {
    if (!entry) return;
    const maxIndex = positions ? positions.length - 1 : 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(i + 1, maxIndex));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [entry, onClose, positions]);

  const mainIdeaBullets = useMemo(() => {
    if (!entry) return null;
    const lang = language === "en" ? "en" : "ko";
    return getEcoMainIdeaBullets(entry.eco, color, lang);
  }, [entry, color, language]);

  const staticFallback = entry ? getOpeningDescription(entry.name) : null;

  if (!entry) return null;

  const maxIndex = positions ? positions.length - 1 : 0;
  const currentFen =
    positions?.[currentIndex]?.fen ??
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const fallbackParagraph = staticFallback
    ? language === "en"
      ? staticFallback.en
      : staticFallback.ko
    : null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden overscroll-none bg-black/65 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-[90dvh] max-h-[90vh] w-full max-w-3xl min-h-0 flex-col overflow-hidden pixel-frame pixel-hud-fill"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-chess-border bg-chess-surface/30 px-4 pb-3 pt-4 dark:bg-chess-elevated/20 sm:px-6 sm:pb-4 sm:pt-5">
          <div className="min-w-0 flex-1">
            <span className="mb-1 block font-pixel text-xs font-bold text-chess-accent">{entry.eco}</span>
            <h2 className="font-pixel text-base font-bold leading-tight text-chess-primary sm:text-lg">
              {entry.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-pixel pixel-btn mt-0.5 shrink-0 px-2 py-1 text-sm leading-none text-chess-muted hover:text-chess-primary"
            aria-label={t("forum.overlay.close")}
          >
            X
          </button>
        </div>

        <div
          data-modal-scroll="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {!entry.moves ? (
            <div className="flex items-center justify-center py-16 text-sm text-chess-muted">{t("tier.noMoves")}</div>
          ) : (
            <div className="flex flex-col gap-6 p-5 sm:p-6">
              <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-start lg:gap-8">
                <div className="mx-auto flex w-full max-w-[min(100%,18.5rem)] shrink-0 flex-col items-center sm:max-w-[min(100%,22rem)] lg:mx-0 lg:w-[min(26rem,42vw)] lg:max-w-[26rem]">
                  <Chessboard
                    options={{
                      position: currentFen,
                      allowDragging: false,
                      animationDurationInMs: 200,
                      showAnimations: true,
                      boardOrientation: color === "black" ? "black" : "white",
                      boardStyle: { width: "100%", aspectRatio: "1" },
                    }}
                  />
                  <div className="mt-3 grid w-full grid-cols-5 gap-1 sm:mt-4">
                    <button
                      type="button"
                      onClick={() => setCurrentIndex(0)}
                      disabled={currentIndex === 0}
                      className="font-pixel pixel-btn min-h-10 w-full px-1.5 py-2 text-xs text-chess-primary disabled:opacity-25"
                    >
                      |&lt;
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
                      disabled={currentIndex === 0}
                      className="font-pixel pixel-btn min-h-10 w-full px-1.5 py-2 text-xs text-chess-primary disabled:opacity-25"
                    >
                      &lt;
                    </button>
                    <span className="flex min-h-10 items-center justify-center text-center font-pixel text-xs tabular-nums text-chess-muted">
                      {currentIndex}/{maxIndex}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentIndex((i) => Math.min(i + 1, maxIndex))}
                      disabled={currentIndex === maxIndex}
                      className="font-pixel pixel-btn min-h-10 w-full px-1.5 py-2 text-xs text-chess-primary disabled:opacity-25"
                    >
                      &gt;
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentIndex(maxIndex)}
                      disabled={currentIndex === maxIndex}
                      className="font-pixel pixel-btn min-h-10 w-full px-1.5 py-2 text-xs text-chess-primary disabled:opacity-25"
                    >
                      &gt;|
                    </button>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="pixel-frame border-chess-accent/40 bg-chess-accent/10 px-4 py-4 dark:bg-chess-accent/15 sm:px-5 sm:py-5">
                    <p className="mb-3 font-pixel text-sm font-bold text-chess-muted sm:text-base">{t("tier.mainIdea")}</p>
                    {mainIdeaBullets ? (
                      <ul className="list-none space-y-3 sm:space-y-3.5">
                        {mainIdeaBullets.map((line, i) => (
                          <li
                            key={i}
                            className="flex gap-3 text-base leading-relaxed text-chess-primary sm:text-lg [overflow-wrap:anywhere]"
                          >
                            <span className="mt-0.5 shrink-0 font-mono text-sm font-bold text-chess-accent sm:text-base">
                              {i + 1}.
                            </span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : fallbackParagraph ? (
                      <p className="text-base leading-relaxed text-chess-primary sm:text-lg [overflow-wrap:anywhere]">
                        {fallbackParagraph}
                      </p>
                    ) : (
                      <p className="text-sm leading-relaxed text-chess-muted sm:text-base">
                        {t("tier.mainIdeaCatalogMissing")}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <p className="mb-2 font-pixel text-sm font-bold text-chess-muted sm:text-[15px]">{t("tier.moveSeq")}</p>
                <div className="flex flex-wrap content-start gap-1">
                  {positions?.slice(1).map((pos, i) => {
                    const moveNum = Math.floor(i / 2) + 1;
                    const isWhiteMove = i % 2 === 0;
                    const isActive = currentIndex === i + 1;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCurrentIndex(i + 1)}
                        className={`font-pixel px-2 py-0.5 text-[15px] font-bold transition-colors ${
                          isActive
                            ? "border-2 border-chess-accent bg-chess-accent text-white"
                            : "pixel-btn text-chess-muted hover:text-chess-primary"
                        }`}
                      >
                        {isWhiteMove && <span className="mr-0.5 text-chess-border">{moveNum}.</span>}
                        {pos.san}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t-2 border-chess-border bg-chess-surface/25 px-4 py-2.5 text-center dark:bg-chess-elevated/15">
          <p className="font-pixel text-[15px] text-chess-muted">{t("tier.modalHelp")}</p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
