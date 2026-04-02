"use client";

import { useMemo } from "react";
import { Chessboard } from "react-chessboard";

export type ArrowShape = { startSquare: string; endSquare: string; color: string };

interface ChessBoardProps {
  fen: string;
  size?: number;
  lastMove?: { from: string; to: string };
  orientation?: "white" | "black";
  arrows?: ArrowShape[];
}

export default function ChessBoard({
  fen,
  size = 400,
  lastMove,
  orientation = "white",
  arrows = [],
}: ChessBoardProps) {
  const squareStyles = useMemo(() => {
    if (!lastMove) return {};
    return {
      [lastMove.from]: { backgroundColor: "rgba(20,85,30,0.32)" },
      [lastMove.to]: { backgroundColor: "rgba(20,85,30,0.44)" },
    };
  }, [lastMove]);

  return (
    <div style={{ width: "100%", maxWidth: size }}>
      <Chessboard
        options={{
          position: fen,
          allowDragging: false,
          animationDurationInMs: 220,
          showAnimations: true,
          boardOrientation: orientation,
          boardStyle: { width: "100%", aspectRatio: "1" },
          squareStyles,
          arrows,
          allowDrawingArrows: false,
        }}
      />
    </div>
  );
}
