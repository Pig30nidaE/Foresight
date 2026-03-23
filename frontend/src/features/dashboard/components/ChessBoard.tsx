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
    const from = orientation === "white" ? lastMove.from : flipSquare(lastMove.from);
    const to = orientation === "white" ? lastMove.to : flipSquare(lastMove.to);
    return {
      [from]: { backgroundColor: "rgba(20,85,30,0.32)" },
      [to]: { backgroundColor: "rgba(20,85,30,0.44)" },
    };
  }, [lastMove, orientation]);

  const flippedArrows = useMemo(() => {
    if (!arrows.length || orientation === "white") return arrows;
    return arrows.map((a) => ({
      startSquare: flipSquare(a.startSquare),
      endSquare: flipSquare(a.endSquare),
      color: a.color,
    }));
  }, [arrows, orientation]);

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
          arrows: flippedArrows,
          allowDrawingArrows: false,
        }}
      />
    </div>
  );
}

function flipSquare(sq: string): string {
  const f = "abcdefgh";
  const r = "12345678";
  return f[7 - f.indexOf(sq[0])] + r[7 - r.indexOf(sq[1])];
}
