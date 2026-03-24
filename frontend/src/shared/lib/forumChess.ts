import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { PieceDropHandlerArgs, PositionDataType } from "react-chessboard";
import { fenStringToPositionObject } from "react-chessboard";

export const DEFAULT_START_FEN = new Chess().fen();

/** 기물 없음(편집용). chess.js 기준 FEN. */
export const EMPTY_BOARD_FEN: string = (() => {
  const c = new Chess();
  c.clear();
  return c.fen();
})();

/**
 * 서버(python-chess) FEN이 chess.js 엄격 검증에 걸리는 경우가 있어,
 * 썸네일 등 표시용으로만 완화 로드 후 정규 FEN을 반환합니다.
 */
export function normalizeFenForDisplay(raw: string | null | undefined): string | null {
  const fen = raw?.trim();
  if (!fen) return null;
  try {
    new Chess(fen);
    return fen;
  } catch {
    try {
      const c = new Chess();
      c.load(fen, { skipValidation: true });
      return c.fen();
    } catch {
      return null;
    }
  }
}

export function getFinalFenFromPgn(pgn: string | null | undefined): string | null {
  if (!pgn?.trim()) return null;
  try {
    const chess = new Chess();
    chess.loadPgn(pgn.trim(), { strict: false });
    return chess.fen();
  } catch {
    return null;
  }
}

/** 글쓰기/수정 폼: 현재 보드 FEN 기준 썸네일 */
export function composerPreviewFen(boardFen: string): string | null {
  return normalizeFenForDisplay(boardFen);
}

/** 텍스트로 붙여 넣은 FEN을 보드에 반영할 수 있게 정규화. 실패 시 null */
export function applyFenStringToBoard(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return new Chess(t).fen();
  } catch {
    try {
      const c = new Chess();
      c.load(t, { skipValidation: true });
      return c.fen();
    } catch {
      return null;
    }
  }
}

export function positionDataToFen(position: PositionDataType): string | null {
  const chess = new Chess();
  chess.clear();
  for (const [sq, data] of Object.entries(position)) {
    const pt = data.pieceType;
    if (pt.length < 2) return null;
    const color = pt[0] === "w" ? "w" : "b";
    const type = pt[1].toLowerCase() as PieceSymbol;
    if (!chess.put({ type, color }, sq as Square)) return null;
  }
  try {
    return chess.fen();
  } catch {
    return null;
  }
}

export function removePieceAtSquareFromFen(fen: string, square: string): string | null {
  const pos = fenStringToPositionObject(fen, 8, 8);
  if (!pos[square]) return fen;
  delete pos[square];
  return positionDataToFen(pos);
}

export function applyPieceDropToFen(
  fen: string,
  args: Pick<PieceDropHandlerArgs, "piece" | "sourceSquare" | "targetSquare">
): string | null {
  const pos = fenStringToPositionObject(fen, 8, 8);
  const { piece, sourceSquare, targetSquare } = args;
  const pt = piece.pieceType;

  if (piece.isSparePiece) {
    if (!targetSquare) return fen;
    pos[targetSquare] = { pieceType: pt };
  } else {
    delete pos[sourceSquare];
    if (targetSquare) {
      pos[targetSquare] = { pieceType: pt };
    }
  }
  return positionDataToFen(pos);
}
