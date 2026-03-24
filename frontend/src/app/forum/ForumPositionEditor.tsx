"use client";

import { useId, useMemo } from "react";
import { Chessboard, ChessboardProvider, SparePiece } from "react-chessboard";

import {
  applyPieceDropToFen,
  DEFAULT_START_FEN,
  removePieceAtSquareFromFen,
} from "@/shared/lib/forumChess";

const SPARE_WHITES = ["wP", "wN", "wB", "wR", "wQ", "wK"] as const;
const SPARE_BLACKS = ["bP", "bN", "bB", "bR", "bQ", "bK"] as const;

type ForumPositionEditorProps = {
  fen: string;
  onFenChange: (fen: string) => void;
  disabled?: boolean;
};

export default function ForumPositionEditor({ fen, onFenChange, disabled }: ForumPositionEditorProps) {
  const boardId = useId().replace(/:/g, "");
  const position = useMemo(() => (fen.trim() ? fen.trim() : DEFAULT_START_FEN), [fen]);

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] leading-snug text-chess-muted">
        기물을 드래그해 옮기거나 아래에서 추가하세요. 칸을 <strong className="text-chess-primary">우클릭</strong>하면 그
        칸의 기물이 제거됩니다.
      </p>
      <div className="mx-auto w-full max-w-[min(100%,18.5rem)]">
        <div onContextMenu={(e) => e.preventDefault()}>
          <ChessboardProvider
            options={{
              id: `forum-editor-${boardId}`,
              position,
              allowDragging: !disabled,
              allowDragOffBoard: false,
              showAnimations: false,
              animationDurationInMs: 0,
              boardOrientation: "white",
              showNotation: false,
              allowDrawingArrows: false,
              boardStyle: {
                width: "100%",
                aspectRatio: "1",
                borderRadius: "8px",
                boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
              },
              onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
                if (disabled) return false;
                const next = applyPieceDropToFen(position, { piece, sourceSquare, targetSquare });
                if (next === null) return false;
                onFenChange(next);
                return true;
              },
              onSquareRightClick: ({ piece, square }) => {
                if (disabled || !piece || !square) return;
                const next = removePieceAtSquareFromFen(position, square);
                if (next === null) return;
                onFenChange(next);
              },
            }}
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-chess-border/50">
              <Chessboard options={{}} />
            </div>
            {!disabled && (
              <div className="mt-1.5 w-full rounded-md border border-chess-border/80 bg-chess-surface/50 px-1 py-1 dark:bg-chess-elevated/40">
                <div className="px-0.5 pb-px">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-chess-muted">백</span>
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
                  <span className="text-[9px] font-medium uppercase tracking-wide text-chess-muted">흑</span>
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
