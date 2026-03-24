"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import ForumPositionEditor from "@/app/forum/ForumPositionEditor";
import { applyFenStringToBoard, DEFAULT_START_FEN, EMPTY_BOARD_FEN } from "@/shared/lib/forumChess";

type ForumBoardEditOverlayProps = {
  open: boolean;
  onClose: () => void;
  boardFen: string;
  onBoardFenChange: (fen: string) => void;
  /** 보드 연결 자체를 끄고(썸네일 없음) 오버레이를 닫음 */
  onDeleteBoard: () => void;
  busy: boolean;
  inputClassName: string;
  ariaTitleId?: string;
};

export default function ForumBoardEditOverlay({
  open,
  onClose,
  boardFen,
  onBoardFenChange,
  onDeleteBoard,
  busy,
  inputClassName,
  ariaTitleId = "forum-board-overlay-title",
}: ForumBoardEditOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [fenDraft, setFenDraft] = useState(boardFen);
  const [fenError, setFenError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setFenDraft(boardFen);
    setFenError(null);
  }, [open, boardFen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleDeleteBoard = () => {
    onDeleteBoard();
    onClose();
  };

  const handleApplyFen = () => {
    const next = applyFenStringToBoard(fenDraft);
    if (!next) {
      setFenError("올바른 FEN 형식이 아닙니다.");
      return;
    }
    setFenError(null);
    onBoardFenChange(next);
    setFenDraft(next);
  };

  if (!mounted || !open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaTitleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity dark:bg-black/60"
        onClick={onClose}
        aria-label="오버레이 닫기"
      />
      <div className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-chess-border bg-chess-bg shadow-2xl dark:border-chess-border dark:bg-chess-elevated">
        <div className="flex items-center justify-between gap-2 border-b border-chess-border/80 px-3 py-2">
          <h3 id={ariaTitleId} className="text-sm font-semibold text-chess-primary">
            썸네일용 보드 · FEN
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-chess-muted transition hover:bg-chess-surface hover:text-chess-primary"
            aria-label="닫기"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-chess-primary">FEN</label>
            <textarea
              value={fenDraft}
              onChange={(e) => {
                setFenDraft(e.target.value);
                setFenError(null);
              }}
              rows={3}
              placeholder="2kr3r/pp1b1p2/2pq1p1p/8/8/1Q3B2/PP3PPP/2RR2K1 b - - 1 18"
              spellCheck={false}
              className={`${inputClassName} resize-y py-2 font-mono text-xs leading-snug`}
            />
            {fenError && <p className="text-xs text-red-600 dark:text-red-400">{fenError}</p>}
            <button
              type="button"
              onClick={handleApplyFen}
              className="inline-flex items-center gap-1 rounded-md border border-chess-border bg-chess-surface/80 px-2.5 py-1.5 text-xs font-medium text-chess-primary transition hover:bg-chess-elevated/80"
            >
              FEN을 보드에 반영
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-chess-border/50 pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onBoardFenChange(DEFAULT_START_FEN)}
              className="rounded-md border border-chess-border bg-chess-surface/80 px-2.5 py-1.5 text-xs font-medium text-chess-primary transition hover:bg-chess-elevated/80 disabled:opacity-50"
            >
              초기화
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onBoardFenChange(EMPTY_BOARD_FEN)}
              className="rounded-md border border-chess-border bg-chess-surface/80 px-2.5 py-1.5 text-xs font-medium text-chess-primary transition hover:bg-chess-elevated/80 disabled:opacity-50"
            >
              기물 전체 삭제
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDeleteBoard}
              className="rounded-md border border-red-400/60 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-500/15 disabled:opacity-50 dark:text-red-300"
            >
              보드 연결 해제
            </button>
          </div>

          <div className="mt-3">
            <ForumPositionEditor fen={boardFen} onFenChange={onBoardFenChange} disabled={busy} />
          </div>
        </div>
        <div className="border-t border-chess-border/70 bg-chess-surface/50 px-3 py-2 dark:bg-chess-surface/30">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-chess-accent py-2 text-sm font-semibold text-white transition hover:brightness-105"
          >
            완료 · 본문으로 돌아가기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
