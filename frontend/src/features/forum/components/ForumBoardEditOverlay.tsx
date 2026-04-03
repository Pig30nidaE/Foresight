"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import ForumPositionEditor, { type ForumAnnotationTool } from "@/features/forum/components/ForumPositionEditor";
import ForumRecordedMoveChips from "@/features/forum/components/ForumRecordedMoveChips";
import {
  applyFenStringToBoard,
  DEFAULT_START_FEN,
  EMPTY_BOARD_FEN,
  fenAfterUcis,
  sanListFromStartAndUcis,
} from "@/shared/lib/forumChess";
import {
  emptyBoardAnnotations,
  FORUM_ANNOTATION_COLORS,
  FORUM_ANNOTATION_EMOJIS,
  FORUM_ANNOTATION_SYMBOL_COLORS,
  mergeAnnotationsForRecordCurrentPly,
  pruneAnnotationsBeyondPly,
  type BoardAnnotations,
} from "@/shared/lib/forumBoardAnnotations";
import { useTranslation } from "@/shared/lib/i18n";

type ForumBoardEditOverlayProps = {
  open: boolean;
  onClose: () => void;
  boardFen: string;
  /** 수 기록 모드일 때 시작 FEN (FEN 입력란 동기화용) */
  recordStartFen: string;
  onBoardFenChange: (fen: string) => void;
  onDeleteBoard: () => void;
  busy: boolean;
  inputClassName: string;
  ariaTitleId?: string;
  annotations: BoardAnnotations;
  onAnnotationsChange: (a: BoardAnnotations) => void;
  recordMoves: boolean;
  onRecordMovesChange: (v: boolean) => void;
  moveUcis: string[];
  onMoveUcisChange: (ucis: string[]) => void;
  onRecordStartFenChange: (fen: string) => void;
  /** PGN 편집 등: 기록 켤 때 시작 FEN을 보드 FEN(종국) 대신 이 값으로 */
  recordingStartHint?: string | null;
  /** true면 기록 켤 때 기존 moveUcis 유지 (글 수정 + 기존 PGN) */
  preserveMovesWhenEnteringRecord?: boolean;
};

export default function ForumBoardEditOverlay({
  open,
  onClose,
  boardFen,
  recordStartFen,
  onBoardFenChange,
  onDeleteBoard,
  busy,
  inputClassName,
  ariaTitleId = "forum-board-overlay-title",
  annotations,
  onAnnotationsChange,
  recordMoves,
  onRecordMovesChange,
  moveUcis,
  onMoveUcisChange,
  onRecordStartFenChange,
  recordingStartHint = null,
  preserveMovesWhenEnteringRecord = false,
}: ForumBoardEditOverlayProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [fenDraft, setFenDraft] = useState(boardFen);
  const [fenError, setFenError] = useState<string | null>(null);
  const [annotationTool, setAnnotationTool] = useState<ForumAnnotationTool>("none");
  const [highlightPick, setHighlightPick] = useState<string>(FORUM_ANNOTATION_COLORS[0].value);
  const [emojiPick, setEmojiPick] = useState<string>(FORUM_ANNOTATION_EMOJIS[0]);

  const displayFen = useMemo(() => {
    if (!recordMoves) return boardFen;
    return fenAfterUcis(recordStartFen, moveUcis) ?? recordStartFen;
  }, [recordMoves, boardFen, recordStartFen, moveUcis]);

  const displayAnnotations = useMemo(() => {
    if (!recordMoves) return annotations;
    return mergeAnnotationsForRecordCurrentPly(annotations, moveUcis.length);
  }, [annotations, recordMoves, moveUcis.length]);

  const overlaySanList = useMemo(
    () => sanListFromStartAndUcis(recordStartFen, moveUcis),
    [recordStartFen, moveUcis]
  );

  const moveUcisRef = useRef(moveUcis);
  moveUcisRef.current = moveUcis;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setFenDraft(recordMoves ? recordStartFen : boardFen);
    setFenError(null);
  }, [open, boardFen, recordMoves, recordStartFen]);

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
      setFenError(t("forum.overlay.invalidFen"));
      return;
    }
    setFenError(null);
    if (recordMoves) {
      onRecordStartFenChange(next);
      onMoveUcisChange([]);
      onAnnotationsChange(pruneAnnotationsBeyondPly(annotations, -1));
    } else {
      onBoardFenChange(next);
    }
    setFenDraft(next);
  };

  const toggleRecord = (on: boolean) => {
    if (on) {
      const hint = recordingStartHint?.trim();
      const usePgnAlignedStart =
        Boolean(preserveMovesWhenEnteringRecord && moveUcis.length > 0) && Boolean(hint);
      const snap = usePgnAlignedStart && hint ? hint : boardFen.trim() || DEFAULT_START_FEN;
      onRecordStartFenChange(snap);
      if (!preserveMovesWhenEnteringRecord) onMoveUcisChange([]);
      onRecordMovesChange(true);
      setAnnotationTool("none");
    } else {
      const endFen = fenAfterUcis(recordStartFen, moveUcis) ?? recordStartFen;
      onBoardFenChange(endFen);
      onMoveUcisChange([]);
      onAnnotationsChange(pruneAnnotationsBeyondPly(annotations, -1));
      onRecordMovesChange(false);
    }
  };

  const saveRecordedSequence = useCallback(() => {
    if (!recordMoves || moveUcis.length === 0) return;
    const endFen = fenAfterUcis(recordStartFen, moveUcis) ?? recordStartFen;
    onBoardFenChange(endFen);
    onAnnotationsChange(pruneAnnotationsBeyondPly(annotations, moveUcis.length));
    onRecordMovesChange(false);
    setAnnotationTool("none");
  }, [
    annotations,
    moveUcis,
    onAnnotationsChange,
    onBoardFenChange,
    onRecordMovesChange,
    recordMoves,
    recordStartFen,
  ]);

  const trimMovesToIndex = useCallback(
    (keep: number) => {
      const nextUcis = moveUcis.slice(0, keep);
      onMoveUcisChange(nextUcis);
      onAnnotationsChange(pruneAnnotationsBeyondPly(annotations, keep === 0 ? -1 : keep));
      const nf = fenAfterUcis(recordStartFen, nextUcis);
      if (nf) onBoardFenChange(nf);
    },
    [annotations, moveUcis, onAnnotationsChange, onBoardFenChange, onMoveUcisChange, recordStartFen]
  );

  const onAnnotationSquare = (square: string) => {
    if (annotationTool === "none") return;
    const plyKey = String(moveUcis.length);

    if (recordMoves) {
      const byPly = { ...(annotations.byPly ?? {}) };
      const bucket = {
        highlights: { ...(byPly[plyKey]?.highlights ?? {}) },
        emojis: { ...(byPly[plyKey]?.emojis ?? {}) },
      };
      if (annotationTool === "clear") {
        delete bucket.highlights[square];
        delete bucket.emojis[square];
      } else if (annotationTool === "highlight") {
        if (bucket.highlights[square] === highlightPick) delete bucket.highlights[square];
        else bucket.highlights[square] = highlightPick;
      } else if (annotationTool === "emoji") {
        if (bucket.emojis[square] === emojiPick) delete bucket.emojis[square];
        else bucket.emojis[square] = emojiPick;
      }
      const next: BoardAnnotations = {
        highlights: { ...annotations.highlights },
        emojis: { ...annotations.emojis },
        byPly: { ...byPly, [plyKey]: bucket },
      };
      if (Object.keys(bucket.highlights).length === 0 && Object.keys(bucket.emojis).length === 0) {
        const { [plyKey]: _, ...rest } = next.byPly ?? {};
        next.byPly = Object.keys(rest).length ? rest : {};
      }
      onAnnotationsChange(next);
      return;
    }

    const next = { ...annotations, highlights: { ...annotations.highlights }, emojis: { ...annotations.emojis } };
    if (annotationTool === "clear") {
      delete next.highlights[square];
      delete next.emojis[square];
      onAnnotationsChange(next);
      return;
    }
    if (annotationTool === "highlight") {
      if (next.highlights[square] === highlightPick) delete next.highlights[square];
      else next.highlights[square] = highlightPick;
      onAnnotationsChange(next);
      return;
    }
    if (annotationTool === "emoji") {
      if (next.emojis[square] === emojiPick) delete next.emojis[square];
      else next.emojis[square] = emojiPick;
      onAnnotationsChange(next);
    }
  };

  const onRecordMove = useCallback(
    (uci: string) => {
      const t = uci?.trim();
      if (!t || t.length < 4) return;
      const prev = moveUcisRef.current;
      const next = [...prev, t];
      if (fenAfterUcis(recordStartFen, next) == null) return;
      onMoveUcisChange(next);
    },
    [onMoveUcisChange, recordStartFen]
  );

  const undoLastMove = () => {
    if (moveUcis.length === 0) return;
    const nextUcis = moveUcis.slice(0, -1);
    onMoveUcisChange(nextUcis);
    onAnnotationsChange(
      pruneAnnotationsBeyondPly(annotations, nextUcis.length === 0 ? -1 : nextUcis.length)
    );
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
        className="absolute inset-0 bg-black/60 transition-opacity dark:bg-black/70"
        onClick={onClose}
        aria-label={t("forum.overlay.closeBackdrop")}
      />
      <div className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden pixel-frame bg-chess-bg font-sans antialiased dark:bg-chess-elevated">
        <div className="flex items-center justify-between gap-2 border-b border-chess-border/80 px-3 py-2">
          <h3 id={ariaTitleId} className="text-sm font-semibold text-chess-primary">
            {t("forum.overlay.title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-chess-muted transition hover:bg-chess-surface hover:text-chess-primary"
            aria-label={t("forum.overlay.close")}
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
              disabled={recordMoves}
              className={`${inputClassName} resize-y py-2 font-mono text-xs leading-snug disabled:opacity-60`}
            />
            {fenError && <p className="text-xs text-red-600 dark:text-red-400">{fenError}</p>}
            <button
              type="button"
              disabled={busy || recordMoves}
              onClick={handleApplyFen}
              className="inline-flex items-center gap-1 rounded-md border border-chess-border bg-chess-surface/80 px-2.5 py-1.5 text-xs font-medium text-chess-primary transition hover:bg-chess-elevated/80 disabled:opacity-50"
            >
              {t("forum.overlay.applyFen")}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-chess-border/50 pt-3">
            <button
              type="button"
              disabled={busy || recordMoves}
              onClick={() => {
                onBoardFenChange(DEFAULT_START_FEN);
                onAnnotationsChange(emptyBoardAnnotations());
              }}
              className="rounded-md border border-chess-border bg-chess-surface/80 px-2.5 py-1.5 text-xs font-medium text-chess-primary transition hover:bg-chess-elevated/80 disabled:opacity-50"
            >
              {t("forum.overlay.resetBoard")}
            </button>
            <button
              type="button"
              disabled={busy || recordMoves}
              onClick={() => {
                onBoardFenChange(EMPTY_BOARD_FEN);
                onAnnotationsChange(emptyBoardAnnotations());
              }}
              className="rounded-md border border-chess-border bg-chess-surface/80 px-2.5 py-1.5 text-xs font-medium text-chess-primary transition hover:bg-chess-elevated/80 disabled:opacity-50"
            >
              {t("forum.overlay.clearPieces")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDeleteBoard}
              className="rounded-md border border-red-400/60 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-500/15 disabled:opacity-50 dark:text-red-300"
            >
              {t("forum.overlay.detachBoard")}
            </button>
          </div>

          <div className="mt-3 space-y-2 border-t border-chess-border/50 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-chess-primary">{t("forum.editor.recordMoves")}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggleRecord(!recordMoves)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  recordMoves
                    ? "border-chess-accent bg-chess-accent/15 text-chess-accent"
                    : "border-chess-border bg-chess-surface/80 text-chess-primary"
                }`}
              >
                {recordMoves ? t("forum.editor.recordOn") : t("forum.editor.recordOff")}
              </button>
              {recordMoves && (
                <button
                  type="button"
                  disabled={busy || moveUcis.length === 0}
                  onClick={undoLastMove}
                  className="rounded-md border border-chess-border px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                >
                  {t("forum.editor.undoMove")}
                </button>
              )}
              {recordMoves && moveUcis.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={saveRecordedSequence}
                  className="rounded-md border border-chess-accent/60 bg-chess-accent/10 px-2.5 py-1 text-xs font-semibold text-chess-accent"
                >
                  {t("forum.overlay.saveMoves")}
                </button>
              )}
            </div>
            {recordMoves && (
              <p className="text-xs text-chess-muted">
                {t("forum.editor.recordHint")} · {moveUcis.length} {t("forum.editor.movesCount")}
              </p>
            )}
          </div>

          {moveUcis.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-chess-border/50 pt-3">
              <ForumRecordedMoveChips
                sanList={overlaySanList}
                disabled={busy}
                onDeleteFromChipIndex={trimMovesToIndex}
                active={recordMoves}
              />
            </div>
          )}

          <div className="mt-3 space-y-2 border-t border-chess-border/50 pt-3">
            <p className="text-xs font-medium text-chess-primary">{t("forum.editor.annotationsTitle")}</p>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["none", t("forum.editor.annNone")],
                  ["highlight", t("forum.editor.annHighlight")],
                  ["emoji", t("forum.editor.annEmoji")],
                  ["clear", t("forum.editor.annClear")],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy}
                  onClick={() => setAnnotationTool(k)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    annotationTool === k ? "border-chess-accent bg-chess-accent/10" : "border-chess-border"
                  } disabled:opacity-40`}
                >
                  {label}
                </button>
              ))}
            </div>
            {annotationTool === "highlight" && (
              <div className="flex flex-wrap gap-1">
                {FORUM_ANNOTATION_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    disabled={busy}
                    title={c.key}
                    onClick={() => setHighlightPick(c.value)}
                    className={`size-7 rounded border-2 ${highlightPick === c.value ? "border-chess-primary" : "border-transparent"}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            )}
            {annotationTool === "emoji" && (
              <div className="flex flex-wrap gap-1">
                {FORUM_ANNOTATION_EMOJIS.map((e) => {
                  const sym = FORUM_ANNOTATION_SYMBOL_COLORS[e];
                  return (
                    <button
                      key={e}
                      type="button"
                      disabled={busy}
                      onClick={() => setEmojiPick(e)}
                      className={`rounded border px-1.5 py-0.5 text-sm font-black ${emojiPick === e ? "border-chess-accent" : "border-chess-border"}`}
                      style={sym ? { color: sym } : undefined}
                    >
                      {e}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-3">
            <ForumPositionEditor
              fen={displayFen}
              onFenChange={onBoardFenChange}
              disabled={busy}
              annotations={displayAnnotations}
              annotationTool={annotationTool}
              onAnnotationSquare={onAnnotationSquare}
              recordMoves={recordMoves}
              onRecordMove={onRecordMove}
            />
          </div>
        </div>
        <div className="border-t border-chess-border/70 bg-chess-surface/50 px-3 py-2 dark:bg-chess-surface/30">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-chess-accent py-2 text-sm font-medium text-white transition hover:brightness-105"
          >
            {t("forum.overlay.done")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
