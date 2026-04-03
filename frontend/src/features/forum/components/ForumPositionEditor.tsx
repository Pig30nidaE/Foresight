"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import { Chessboard, ChessboardProvider, SparePiece } from "react-chessboard";
import { fenStringToPositionObject } from "react-chessboard";

import ForumBoardAnnotationLayer from "@/features/forum/components/ForumBoardAnnotationLayer";
import {
  applyPieceDropToFen,
  DEFAULT_START_FEN,
  legalTargetsForSquareFromFen,
  movePieceOnFenIfLegal,
  removePieceAtSquareFromFen,
  tryLegalMoveUci,
} from "@/shared/lib/forumChess";
import { highlightsToSquareStyles, type BoardAnnotations } from "@/shared/lib/forumBoardAnnotations";
import { useTranslation } from "@/shared/lib/i18n";

const SPARE_WHITES = ["wP", "wN", "wB", "wR", "wQ", "wK"] as const;
const SPARE_BLACKS = ["bP", "bN", "bB", "bR", "bQ", "bK"] as const;

export type ForumAnnotationTool = "none" | "highlight" | "emoji" | "clear";

export type ForumPositionEditorProps = {
  fen: string;
  onFenChange: (fen: string) => void;
  disabled?: boolean;
  annotations?: BoardAnnotations;
  annotationTool?: ForumAnnotationTool;
  onAnnotationSquare?: (square: string) => void;
  /** true면 합법 수만 적용하고 UCI를 부모로 전달 (FEN은 부모가 fenAfterUcis로 계산) */
  recordMoves?: boolean;
  onRecordMove?: (uci: string) => void;
};

export default function ForumPositionEditor({
  fen,
  onFenChange,
  disabled = false,
  annotations,
  annotationTool = "none",
  onAnnotationSquare,
  recordMoves = false,
  onRecordMove,
}: ForumPositionEditorProps) {
  const { t } = useTranslation();
  const boardId = useId().replace(/:/g, "");
  const position = useMemo(() => (fen.trim() ? fen.trim() : DEFAULT_START_FEN), [fen]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);
  const [deleteMode, setDeleteMode] = useState(false);
  /** 불합법 드래그/클릭 후 react-chessboard 내부 상태를 FEN과 맞춤 */
  const [boardSyncKey, setBoardSyncKey] = useState(0);

  const ann = annotations ?? { highlights: {}, emojis: {} };

  const clearSelection = () => {
    setSelectedSquare(null);
    setLegalTargets([]);
  };

  const activateSelection = (square: string) => {
    setSelectedSquare(square);
    setLegalTargets(legalTargetsForSquareFromFen(position, square));
  };

  const handleAnnotationClick = (square: string) => {
    if (!onAnnotationSquare || annotationTool === "none") return;
    onAnnotationSquare(square);
  };

  const onSquareClick = (square: string) => {
    if (disabled || !square) return;
    if (onAnnotationSquare && annotationTool !== "none") {
      handleAnnotationClick(square);
      clearSelection();
      return;
    }

    const pos = fenStringToPositionObject(position, 8, 8);
    if (deleteMode && !recordMoves) {
      const next = removePieceAtSquareFromFen(position, square);
      if (next !== null) onFenChange(next);
      clearSelection();
      return;
    }

    if (recordMoves && onRecordMove) {
      if (selectedSquare) {
        if (square === selectedSquare) {
          clearSelection();
          return;
        }
        const targetOccupied = Boolean(pos[square]);
        if (targetOccupied) {
          const selPt = pos[selectedSquare]?.pieceType;
          const tgtPt = pos[square]?.pieceType;
          const sameColor = Boolean(selPt && tgtPt && selPt[0] === tgtPt[0]);
          if (sameColor) {
            activateSelection(square);
            return;
          }
        }
        if (!legalTargets.includes(square)) {
          setBoardSyncKey((k) => k + 1);
          clearSelection();
          return;
        }
        const r = tryLegalMoveUci(position, selectedSquare, square);
        if (r) {
          onRecordMove(r.uci);
          clearSelection();
          return;
        }
        setBoardSyncKey((k) => k + 1);
        clearSelection();
        return;
      }
      if (pos[square]) {
        activateSelection(square);
      } else {
        clearSelection();
      }
      return;
    }

    if (selectedSquare) {
      const moved = movePieceOnFenIfLegal(position, selectedSquare, square);
      if (moved) {
        onFenChange(moved);
        clearSelection();
        return;
      }
    }
    if (pos[square]) {
      activateSelection(square);
    } else {
      clearSelection();
    }
  };

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {
      ...highlightsToSquareStyles(ann.highlights),
    };
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...styles[selectedSquare],
        boxShadow: "inset 0 0 0 3px rgba(166, 124, 68, 0.9)",
      };
    }
    for (const sq of legalTargets) {
      const base = styles[sq] ?? {};
      styles[sq] = {
        ...base,
        backgroundImage:
          "radial-gradient(circle at center, rgba(166, 124, 68, 0.92) 16%, rgba(166, 124, 68, 0.35) 18%, transparent 20%)",
      };
    }
    return styles;
  }, [selectedSquare, legalTargets, ann.highlights]);

  const spareEnabled = !disabled && !recordMoves;

  return (
    <div className="space-y-1.5 font-sans antialiased">
      <p className="text-xs leading-snug text-chess-muted">{t("forum.editor.help")}</p>
      {!disabled && !recordMoves && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDeleteMode((prev) => !prev);
              clearSelection();
            }}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              deleteMode
                ? "border-red-500/70 bg-red-500/10 text-red-700 dark:text-red-300"
                : "border-chess-border bg-chess-surface/70 text-chess-primary hover:bg-chess-elevated/70"
            }`}
          >
            {deleteMode ? t("forum.editor.deleteModeOn") : t("forum.editor.deleteModeOff")}
          </button>
          <span className="text-xs text-chess-muted">{t("forum.editor.deleteHint")}</span>
        </div>
      )}
      <div className="mx-auto w-full max-w-[min(100%,18.5rem)]">
        <div onContextMenu={(e) => e.preventDefault()}>
          <ChessboardProvider
            options={{
              id: `forum-editor-${boardId}`,
              position,
              allowDragging: !disabled && annotationTool === "none" && !recordMoves,
              allowDragOffBoard: spareEnabled,
              showAnimations: false,
              animationDurationInMs: 0,
              boardOrientation: "white",
              showNotation: true,
              allowDrawingArrows: false,
              squareStyles: customSquareStyles,
              boardStyle: {
                width: "100%",
                aspectRatio: "1",
                borderRadius: "8px",
                boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
              },
              onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
                if (disabled || annotationTool !== "none") return false;
                if (recordMoves && onRecordMove && sourceSquare && targetSquare && !piece.isSparePiece) {
                  const r = tryLegalMoveUci(position, sourceSquare, targetSquare);
                  if (r) {
                    onRecordMove(r.uci);
                    clearSelection();
                    return true;
                  }
                  setBoardSyncKey((k) => k + 1);
                  clearSelection();
                  return false;
                }
                if (piece.isSparePiece && recordMoves) return false;
                const next = applyPieceDropToFen(position, { piece, sourceSquare, targetSquare });
                if (next === null) return false;
                onFenChange(next);
                clearSelection();
                return true;
              },
              onSquareClick: ({ square }) => {
                if (!square) return;
                onSquareClick(square);
              },
              onSquareRightClick: ({ piece, square }) => {
                if (disabled || recordMoves || !piece || !square) return;
                const next = removePieceAtSquareFromFen(position, square);
                if (next === null) return;
                onFenChange(next);
                clearSelection();
              },
            }}
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-chess-border/50">
              <Chessboard key={`${position}-${boardSyncKey}`} options={{}} />
              {Object.keys(ann.emojis).length > 0 || onAnnotationSquare ? (
                <ForumBoardAnnotationLayer
                  annotations={{ highlights: {}, emojis: ann.emojis }}
                  onSquareClick={
                    onAnnotationSquare && annotationTool !== "none" ? handleAnnotationClick : undefined
                  }
                />
              ) : null}
            </div>
            {spareEnabled && (
              <div className="mt-1.5 w-full rounded-md border border-chess-border/80 bg-chess-surface/50 px-1 py-1 dark:bg-chess-elevated/40">
                <div className="px-0.5 pb-px">
                  <span className="text-[15px] font-medium uppercase tracking-wide text-chess-muted">
                    {t("forum.editor.white")}
                  </span>
                </div>
                <div className="grid w-full grid-cols-6 gap-px">
                  {SPARE_WHITES.map((pt) => (
                    <div
                      key={pt}
                      className="flex aspect-square min-w-0 max-w-full items-center justify-center [&>div]:!h-full [&>div]:!w-full"
                    >
                      <div className="h-full max-h-7 w-full max-w-7 [&>div]:!h-full [&>div]:!w-full">
                        <SparePiece pieceType={pt} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-0.5 pt-0.5 pb-px">
                  <span className="text-[15px] font-medium uppercase tracking-wide text-chess-muted">
                    {t("forum.editor.black")}
                  </span>
                </div>
                <div className="grid w-full grid-cols-6 gap-px">
                  {SPARE_BLACKS.map((pt) => (
                    <div
                      key={pt}
                      className="flex aspect-square min-w-0 max-w-full items-center justify-center [&>div]:!h-full [&>div]:!w-full"
                    >
                      <div className="h-full max-h-7 w-full max-w-7 [&>div]:!h-full [&>div]:!w-full">
                        <SparePiece pieceType={pt} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChessboardProvider>
        </div>
      </div>
    </div>
  );
}
