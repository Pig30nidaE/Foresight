"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { OpeningTierEntry } from "../types";

interface Props {
  entry: OpeningTierEntry | null;
  onClose: () => void;
}

interface Position {
  fen: string;
  san: string;
}

export default function OpeningMovesModal({ entry, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

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

  // 엔트리 변경 시 인덱스 초기화
  useEffect(() => {
    setCurrentIndex(0);
  }, [entry]);

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
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [entry, onClose, positions]);

  if (!entry) return null;

  const maxIndex = positions ? positions.length - 1 : 0;
  const currentFen =
    positions?.[currentIndex]?.fen ??
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-chess-bg border border-chess-border/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-chess-border">
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

        {/* Body */}
        {!entry.moves ? (
          <div className="flex items-center justify-center py-16 text-chess-muted text-sm">
            수 순서 정보 없음
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-5 p-5 overflow-y-auto">
            {/* 체스보드 + 네비게이션 */}
            <div className="shrink-0 flex flex-col items-center">
              <div className="w-64 md:w-72">
                <Chessboard
                  options={{
                    position: currentFen,
                    allowDragging: false,
                    animationDurationInMs: 200,
                    showAnimations: true,
                    boardStyle: { width: "100%", aspectRatio: "1" },
                  }}
                />
              </div>
              {/* 네비게이션 버튼 */}
              <div className="flex items-center gap-1 mt-3">
                <button
                  onClick={() => setCurrentIndex(0)}
                  disabled={currentIndex === 0}
                  className="px-2.5 py-1 text-xs text-chess-muted hover:text-chess-primary disabled:opacity-25 transition-colors font-mono"
                >
                  |◀
                </button>
                <button
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
                  onClick={() =>
                    setCurrentIndex((i) => Math.min(i + 1, maxIndex))
                  }
                  disabled={currentIndex === maxIndex}
                  className="px-2.5 py-1 text-xs text-chess-muted hover:text-chess-primary disabled:opacity-25 transition-colors font-mono"
                >
                  ▶
                </button>
                <button
                  onClick={() => setCurrentIndex(maxIndex)}
                  disabled={currentIndex === maxIndex}
                  className="px-2.5 py-1 text-xs text-chess-muted hover:text-chess-primary disabled:opacity-25 transition-colors font-mono"
                >
                  ▶|
                </button>
              </div>
            </div>

            {/* 수 순서 목록 */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-chess-muted mb-2 font-medium uppercase tracking-wide">
                수 순서
              </p>
              <div className="flex flex-wrap gap-1 content-start">
                {positions?.slice(1).map((pos, i) => {
                  const moveNum = Math.floor(i / 2) + 1;
                  const isWhiteMove = i % 2 === 0;
                  const isActive = currentIndex === i + 1;
                  return (
                    <button
                      key={i}
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
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-chess-border text-center">
          <p className="text-xs text-chess-muted">
            ← → 키로 이동 · ESC 또는 배경 클릭으로 닫기
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
