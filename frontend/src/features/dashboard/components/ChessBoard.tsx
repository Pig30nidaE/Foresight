"use client";

import { useMemo } from "react";
import { Chessboard } from "react-chessboard";

interface ChessBoardProps {
  fen: string;
  size?: number;
  lastMove?: { from: string; to: string };
  orientation?: "white" | "black";
}

export default function ChessBoard({
  fen,
  size = 400,
  lastMove,
  orientation = "white",
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

  return (
    <div style={{ width: size }}>
      <Chessboard
        options={{
          position: fen,
          allowDragging: false,
          animationDurationInMs: 220,
          showAnimations: true,
          boardOrientation: orientation,
          boardStyle: { width: "100%", aspectRatio: "1" },
          squareStyles,
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
