"use client";

import { useMemo } from "react";

interface ChessBoardProps {
  fen: string;
  size?: number;
  lastMove?: { from: string; to: string }; // UCI notation
  orientation?: "white" | "black";
}

// FEN to piece mapping
const PIECE_SYMBOLS: Record<string, string> = {
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
  P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔",
};

const PIECE_COLORS: Record<string, string> = {
  p: "text-black", n: "text-black", b: "text-black", r: "text-black", q: "text-black", k: "text-black",
  P: "text-white drop-shadow-md", N: "text-white drop-shadow-md", B: "text-white drop-shadow-md", 
  R: "text-white drop-shadow-md", Q: "text-white drop-shadow-md", K: "text-white drop-shadow-md",
};

export default function ChessBoard({ 
  fen, 
  size = 320, 
  lastMove,
  orientation = "white" 
}: ChessBoardProps) {
  const board = useMemo(() => {
    // Parse FEN (just the position part before the space)
    const positionPart = fen.split(" ")[0];
    const rows = positionPart.split("/");
    
    const squares: (string | null)[][] = [];
    
    for (const row of rows) {
      const squaresInRow: (string | null)[] = [];
      for (const char of row) {
        if (/\d/.test(char)) {
          // Empty squares
          const emptyCount = parseInt(char);
          for (let i = 0; i < emptyCount; i++) {
            squaresInRow.push(null);
          }
        } else {
          squaresInRow.push(char);
        }
      }
      squares.push(squaresInRow);
    }
    
    // Reverse if orientation is black (so black pieces are at bottom)
    if (orientation === "black") {
      squares.reverse();
      for (const row of squares) {
        row.reverse();
      }
    }
    
    return squares;
  }, [fen, orientation]);

  // Parse last move for highlighting
  const highlightedSquares = useMemo(() => {
    if (!lastMove) return new Set<string>();
    const set = new Set<string>();
    // Convert UCI to algebraic notation
    const files = "abcdefgh";
    const ranks = "12345678";
    
    if (orientation === "white") {
      set.add(lastMove.from);
      set.add(lastMove.to);
    } else {
      // Flip for black orientation
      const flipFile = (f: string) => files[7 - files.indexOf(f)];
      const flipRank = (r: string) => ranks[7 - ranks.indexOf(r)];
      set.add(flipFile(lastMove.from[0]) + flipRank(lastMove.from[1]));
      set.add(flipFile(lastMove.to[0]) + flipRank(lastMove.to[1]));
    }
    return set;
  }, [lastMove, orientation]);

  const squareSize = size / 8;
  const files = orientation === "white" ? "abcdefgh" : "hgfedcba";
  const ranks = orientation === "white" ? "87654321" : "12345678";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Files and ranks labels */}
      <div className="absolute -bottom-5 left-0 right-0 flex justify-between px-1 text-xs text-chess-muted">
        {files.split("").map((f) => (
          <span key={f} style={{ width: squareSize, textAlign: "center" }}>{f}</span>
        ))}
      </div>
      <div className="absolute -left-5 top-0 bottom-0 flex flex-col justify-between py-1 text-xs text-chess-muted">
        {ranks.split("").map((r) => (
          <span key={r} style={{ height: squareSize, display: "flex", alignItems: "center" }}>{r}</span>
        ))}
      </div>

      {/* Board */}
      <div 
        className="grid grid-cols-8 border-2 border-chess-border rounded overflow-hidden"
        style={{ width: size, height: size }}
      >
        {board.map((row, rowIndex) => 
          row.map((piece, colIndex) => {
            const isLight = (rowIndex + colIndex) % 2 === 0;
            const file = files[colIndex];
            const rank = ranks[rowIndex];
            const squareName = file + rank;
            const isHighlighted = highlightedSquares.has(squareName);
            
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`
                  flex items-center justify-center text-2xl select-none
                  ${isLight ? "bg-amber-100" : "bg-amber-700"}
                  ${isHighlighted ? "ring-2 ring-chess-accent ring-inset" : ""}
                `}
                style={{ 
                  width: squareSize, 
                  height: squareSize,
                  fontSize: squareSize * 0.7,
                }}
              >
                {piece && (
                  <span className={PIECE_COLORS[piece]}>
                    {PIECE_SYMBOLS[piece]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
