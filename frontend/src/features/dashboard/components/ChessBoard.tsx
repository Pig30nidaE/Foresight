"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ChessBoardProps {
  fen: string;
  size?: number;
  lastMove?: { from: string; to: string };
  orientation?: "white" | "black";
}

// Lichess cburnett piece set – professional quality, used by major chess platforms
function pieceUrl(piece: string): string {
  const color = piece === piece.toUpperCase() ? "w" : "b";
  return `https://lichess1.org/assets/piece/cburnett/${color}${piece.toUpperCase()}.svg`;
}

// Parse FEN position string into an 8×8 grid
function parseFen(fen: string): (string | null)[][] {
  return fen.split(" ")[0].split("/").map((row) => {
    const cells: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) cells.push(null);
      else cells.push(ch);
    }
    return cells;
  });
}

function squareToColRow(sq: string, files: string, ranks: string) {
  return { col: files.indexOf(sq[0]), row: ranks.indexOf(sq[1]) };
}

export default function ChessBoard({
  fen,
  size = 400,
  lastMove,
  orientation = "white",
}: ChessBoardProps) {
  const files = orientation === "white" ? "abcdefgh" : "hgfedcba";
  const ranks = orientation === "white" ? "87654321" : "12345678";

  const board = useMemo(() => {
    const grid = parseFen(fen);
    if (orientation === "black") {
      grid.reverse();
      grid.forEach((r) => r.reverse());
    }
    return grid;
  }, [fen, orientation]);

  const sq = size / 8; // pixel size of each square

  // ----- Smooth piece-movement animation -----
  // We render ALL pieces at their static final position.
  // When a move happens we additionally render ONE floating "ghost" piece
  // that slides from the source square to the destination square using CSS transform.
  const [ghost, setGhost] = useState<{
    piece: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    active: boolean; // false = just mounted (at fromX/fromY), true = slide to toX/toY
  } | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastMoveRef = useRef(lastMove);

  useEffect(() => {
    const prev = lastMoveRef.current;
    lastMoveRef.current = lastMove;

    if (!lastMove) return;
    if (prev?.from === lastMove.from && prev?.to === lastMove.to) return; // same move, skip

    const matchFrom = (sq: string) =>
      orientation === "white"
        ? sq
        : String.fromCharCode(104 - (sq.charCodeAt(0) - 97)) +
          String.fromCharCode(48 + (57 - sq.charCodeAt(1)));

    const toSquare = matchFrom(lastMove.to);
    const { col: tC, row: tR } = squareToColRow(toSquare, files, ranks);
    const piece = board?.[tR]?.[tC];
    if (!piece) return;

    const fromSquare = matchFrom(lastMove.from);
    const { col: fC, row: fR } = squareToColRow(fromSquare, files, ranks);

    // cancel any pending animation
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

    // Phase 1: place ghost at source (no transition)
    setGhost({ piece, fromX: fC * sq, fromY: fR * sq, toX: tC * sq, toY: tR * sq, active: false });

    // Phase 2: next frame → trigger CSS transition to destination
    animFrameRef.current = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setGhost((g) => g ? { ...g, active: true } : null);
      });
    });

    // Phase 3: clear ghost after animation completes
    clearTimerRef.current = setTimeout(() => setGhost(null), 400);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMove?.from, lastMove?.to]);

  const LIGHT = "#f0d9b5";
  const DARK  = "#b58863";

  return (
    <div
      style={{
        display: "inline-block",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12)",
        background: "#6b3a2a",
        padding: 10,
      }}
    >
      {/* board grid */}
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: 4,
          overflow: "hidden",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3)",
        }}
      >
        {board.map((row, ri) =>
          row.map((piece, ci) => {
            const isLight = (ri + ci) % 2 === 0;
            const file = files[ci];
            const rank = ranks[ri];
            const sqName = file + rank;
            const isFrom = lastMove && (orientation === "white" ? lastMove.from : flipSquare(lastMove.from)) === sqName;
            const isTo   = lastMove && (orientation === "white" ? lastMove.to   : flipSquare(lastMove.to))   === sqName;

            // While ghost is animating, hide piece at destination to avoid double-render
            const hideStaticPiece = ghost !== null && isTo;

            return (
              <div
                key={`${ri}-${ci}`}
                style={{
                  position: "absolute",
                  left: ci * sq,
                  top: ri * sq,
                  width: sq,
                  height: sq,
                  background: isLight ? LIGHT : DARK,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* last-move highlight */}
                {(isFrom || isTo) && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(20,85,30,0.38)",
                    pointerEvents: "none",
                  }} />
                )}
                {/* coordinates */}
                {ci === 0 && (
                  <span style={{
                    position: "absolute", top: 2, left: 3,
                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                    color: isLight ? DARK : LIGHT, opacity: 0.85,
                    fontFamily: "Georgia, serif",
                    pointerEvents: "none",
                  }}>{rank}</span>
                )}
                {ri === 7 && (
                  <span style={{
                    position: "absolute", bottom: 2, right: 3,
                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                    color: isLight ? DARK : LIGHT, opacity: 0.85,
                    fontFamily: "Georgia, serif",
                    pointerEvents: "none", textTransform: "uppercase",
                  }}>{file}</span>
                )}
                {/* static piece */}
                {piece && !hideStaticPiece && (
                  <img
                    src={pieceUrl(piece)}
                    alt={piece}
                    draggable={false}
                    style={{
                      width: sq * 0.88,
                      height: sq * 0.88,
                      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
                      pointerEvents: "none",
                      userSelect: "none",
                      position: "relative",
                      zIndex: 1,
                    }}
                  />
                )}
              </div>
            );
          })
        )}

        {/* sliding ghost piece */}
        {ghost && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: sq,
              height: sq,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `translate(${ghost.active ? ghost.toX : ghost.fromX}px, ${ghost.active ? ghost.toY : ghost.fromY}px)`,
              transition: ghost.active ? "transform 0.32s cubic-bezier(0.25,0.8,0.25,1)" : "none",
              zIndex: 20,
              pointerEvents: "none",
              willChange: "transform",
            }}
          >
            <img
              src={pieceUrl(ghost.piece)}
              alt={ghost.piece}
              draggable={false}
              style={{
                width: sq * 0.92,
                height: sq * 0.92,
                filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.55))",
                userSelect: "none",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function flipSquare(sq: string): string {
  const f = "abcdefgh";
  const r = "12345678";
  return f[7 - f.indexOf(sq[0])] + r[7 - r.indexOf(sq[1])];
}
