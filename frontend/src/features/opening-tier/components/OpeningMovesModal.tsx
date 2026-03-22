"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { OpeningTierEntry, OpeningDetail } from "../types";
import { getOpeningDetail } from "../api";
import { getOpeningDescription } from "../openingDescriptions";
import { useTranslation } from "@/shared/lib/i18n";
import { useBodyScrollLock } from "@/shared/lib/useBodyScrollLock";

interface Props {
  entry: OpeningTierEntry | null;
  onClose: () => void;
  color?: string;
}

interface Position {
  fen: string;
  san: string;
}

export default function OpeningMovesModal({ entry, onClose, color = "white" }: Props) {
  const { t } = useTranslation();
  useBodyScrollLock(!!entry);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [detail, setDetail] = useState<OpeningDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);

  // UCI moves → FEN array + SAN array
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

  // 엔트리 변경 시 인덱스 및 상세 정보 초기화 + fetch
  useEffect(() => {
    setCurrentIndex(0);
    setDetail(null);
    setTipsOpen(false);
    if (!entry) return;
    setDetailLoading(true);
    getOpeningDetail(entry.eco, entry.name, color)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [entry, color]);

  // ESC + 화살표 키 처리
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

  if (!entry) return null;

  const maxIndex = positions ? positions.length - 1 : 0;
  const description = entry ? getOpeningDescription(entry.name) : null;
  const currentFen =
    positions?.[currentIndex]?.fen ??
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden overscroll-none bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl h-[90dvh] max-h-[90vh] min-h-0 flex flex-col bg-chess-bg border border-chess-border/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-chess-border">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-mono font-bold text-chess-accent mb-1 block">
              {entry.eco}
            </span>
            <h2 className="text-lg font-bold text-chess-primary leading-tight">
              {entry.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-chess-muted hover:text-chess-primary transition-colors text-xl leading-none mt-0.5"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div
          data-modal-scroll="true"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Body */}
          {!entry.moves ? (
            <div className="flex items-center justify-center py-16 text-chess-muted text-sm">
              {t("tier.noMoves")}
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-5 p-5">
              {/* 체스보드 + 네비게이션 */}
              <div className="shrink-0 flex flex-col items-center">
                <div className="w-64 md:w-72">
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
                </div>
                {/* 네비게이션 버튼 */}
                <div className="flex items-center gap-1 mt-3">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex(0)}
                    disabled={currentIndex === 0}
                    className="px-2.5 py-1 text-xs text-chess-muted hover:text-chess-primary disabled:opacity-25 transition-colors font-mono"
                  >
                    |◀
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
                    disabled={currentIndex === 0}
                    className="px-2.5 py-1 text-xs text-chess-muted hover:text-chess-primary disabled:opacity-25 transition-colors font-mono"
                  >
                    ◀
                  </button>
                  <span className="text-xs text-chess-muted tabular-nums w-14 text-center">
                    {currentIndex} / {maxIndex}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((i) => Math.min(i + 1, maxIndex))
                    }
                    disabled={currentIndex === maxIndex}
                    className="px-2.5 py-1 text-xs text-chess-muted hover:text-chess-primary disabled:opacity-25 transition-colors font-mono"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex(maxIndex)}
                    disabled={currentIndex === maxIndex}
                    className="px-2.5 py-1 text-xs text-chess-muted hover:text-chess-primary disabled:opacity-25 transition-colors font-mono"
                  >
                    ▶|
                  </button>
                </div>
              </div>

              {/* 수 순서 목록 + 메인 아이디어 */}
              <div className="flex-1 min-w-0 flex flex-col gap-4">
                <div>
                  <p className="text-xs text-chess-muted mb-2 font-medium uppercase tracking-wide">
                    {t("tier.moveSeq")}
                  </p>
                  <div className="flex flex-wrap gap-1 content-start">
                    {positions?.slice(1).map((pos, i) => {
                      const moveNum = Math.floor(i / 2) + 1;
                      const isWhiteMove = i % 2 === 0;
                      const isActive = currentIndex === i + 1;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setCurrentIndex(i + 1)}
                          className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                            isActive
                              ? "bg-chess-accent/30 text-chess-accent border border-chess-accent/40"
                              : "text-chess-muted hover:text-chess-primary hover:bg-chess-border"
                          }`}
                        >
                          {isWhiteMove && (
                            <span className="text-chess-border mr-0.5">{moveNum}.</span>
                          )}
                          {pos.san}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {description && (
                  <div className="rounded-lg bg-chess-accent/5 border border-chess-accent/20 px-3 py-2.5">
                    <p className="text-xs text-chess-muted mb-1 font-medium uppercase tracking-wide">
                      {t("tier.mainIdea")}
                    </p>
                    <p className="text-sm text-chess-primary leading-relaxed">
                      {description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 핵심 포인트 & YouTube 링크 */}
          <div className="px-5 pb-4 border-t border-chess-border pt-4 shrink-0">
          {/* 핵심 포인트 — 접기/펼치기 */}
          <div>
            <button
              type="button"
              onClick={() => setTipsOpen((v) => !v)}
              className="flex items-center gap-1.5 w-full text-left group mb-2"
            >
              <p className="text-xs text-chess-muted font-medium uppercase tracking-wide">
                {t("tier.keyPoints")}
              </p>
              <svg
                className={`w-3.5 h-3.5 text-chess-muted transition-transform duration-200 ${tipsOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {tipsOpen && (
              <div className="mb-4">
                {detailLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-4 rounded bg-chess-border/40 animate-pulse"
                        style={{ width: `${70 + i * 8}%` }}
                      />
                    ))}
                  </div>
                ) : detail && detail.tips.length > 0 ? (
                  <ol className="space-y-1.5 list-none">
                    {detail.tips.map((tip, i) => (
                      <li key={i} className="flex gap-2 text-sm text-chess-primary">
                        <span className="shrink-0 text-chess-accent font-mono font-bold">
                          {i + 1}.
                        </span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-chess-muted">
                    {t("tier.failedKeyPoints")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* YouTube 검색 링크 */}
          <div>
            <p className="text-xs text-chess-muted mb-2 font-medium uppercase tracking-wide">
              {t("tier.youtube")}
            </p>
            {detail ? (
              <a
                href={detail.youtube_search_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/8 text-red-700 border border-red-600/28 hover:bg-red-600/15 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                {t("tier.searchYoutube").replace("{name}", entry.name)}
              </a>
            ) : detailLoading ? (
              <div className="h-7 w-48 rounded-lg bg-chess-border/40 animate-pulse" />
            ) : (
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(entry.name + " " + entry.eco + " 체스 오프닝 강의 한국어")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/8 text-red-700 border border-red-600/28 hover:bg-red-600/15 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                {t("tier.searchYoutube").replace("{name}", entry.name)}
              </a>
            )}
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-2.5 border-t border-chess-border text-center">
          <p className="text-xs text-chess-muted">
            {t("tier.modalHelp")}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
