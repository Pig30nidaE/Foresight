import { Chess, type PieceSymbol, type Square, type Move } from "chess.js";
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

function loadChessRelaxed(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    try {
      const c = new Chess();
      c.load(fen, { skipValidation: true });
      return c;
    } catch {
      return null;
    }
  }
}

function fenWithTurn(fen: string, turn: "w" | "b"): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return fen;
  parts[1] = turn;
  return parts.join(" ");
}

export function legalTargetsForSquareFromFen(fen: string, square: string): string[] {
  const chess = loadChessRelaxed(fen);
  if (!chess) return [];
  try {
    const piece = chess.get(square as Square);
    if (!piece) return [];
    // Position editor allows moving either side regardless of current turn.
    const forcedTurnFen = fenWithTurn(chess.fen(), piece.color);
    const board = loadChessRelaxed(forcedTurnFen);
    if (!board) return [];
    const moves = board.moves({ square: square as Square, verbose: true });
    return moves.map((m) => m.to);
  } catch {
    return [];
  }
}

export function movePieceOnFenIfLegal(fen: string, from: string, to: string): string | null {
  const r = tryLegalMoveUci(fen, from, to);
  return r?.fen ?? null;
}

/** 합법 이동 시 새 FEN과 UCI(프로모션 시 5글자). 승급 칸은 승급 없이 두면 chess.js가 수를 못 찾으므로 q/r/b/n 순으로 시도. */
export function tryLegalMoveUci(fen: string, from: string, to: string): { fen: string; uci: string } | null {
  const chess = loadChessRelaxed(fen);
  if (!chess) return null;
  try {
    const piece = chess.get(from as Square);
    if (!piece) return null;
    const forcedTurnFen = fenWithTurn(chess.fen(), piece.color);
    const promos: readonly Move["promotion"][] = ["q", "r", "b", "n"];

    const tryPlay = (spec: {
      from: Square;
      to: Square;
      promotion?: Move["promotion"];
    }): { fen: string; uci: string } | null => {
      const board = loadChessRelaxed(forcedTurnFen);
      if (!board) return null;
      try {
        const moved = board.move(spec);
        if (!moved) return null;
        const uci = moved.from + moved.to + (moved.promotion ?? "");
        return { fen: board.fen(), uci };
      } catch {
        return null;
      }
    };

    let r = tryPlay({ from: from as Square, to: to as Square });
    if (r) return r;
    for (const p of promos) {
      r = tryPlay({ from: from as Square, to: to as Square, promotion: p });
      if (r) return r;
    }
    return null;
  } catch {
    return null;
  }
}

function _uciToMove(uci: string): { from: Square; to: Square; promotion?: string } | null {
  if (uci.length < 4) return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return { from, to, promotion };
}

/** 시작 FEN에 UCI 순서를 적용한 결과 FEN. (chess.js는 불합법 수에 예외를 던질 수 있어 전부 흡수) */
export function fenAfterUcis(startFen: string, ucis: string[]): string | null {
  const board = loadChessRelaxed(startFen);
  if (!board) return null;
  try {
    for (const uci of ucis) {
      const m = _uciToMove(uci);
      if (!m) return null;
      let mv: ReturnType<Chess["move"]>;
      try {
        mv = board.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion as Move["promotion"],
        });
      } catch {
        return null;
      }
      if (!mv) return null;
    }
    return board.fen();
  } catch {
    return null;
  }
}

function _startFenNeedsPgnHeaders(startFen: string): boolean {
  try {
    const def = new Chess();
    const cur = loadChessRelaxed(startFen);
    if (!cur) return true;
    return def.fen().split(" ")[0] !== cur.fen().split(" ")[0];
  } catch {
    return true;
  }
}

/** 수 기록 모드 저장용 PGN (비표준 시작이면 SetUp/FEN 헤더 포함). */
export function buildPgnFromStartAndUcis(startFen: string, ucis: string[]): string | null {
  const board = loadChessRelaxed(startFen);
  if (!board) return null;
  try {
    for (const uci of ucis) {
      const m = _uciToMove(uci);
      if (!m) return null;
      let mv: ReturnType<Chess["move"]>;
      try {
        mv = board.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion as Move["promotion"],
        });
      } catch {
        return null;
      }
      if (!mv) return null;
    }
  } catch {
    return null;
  }
  let pgn = board.pgn({ maxWidth: 0, newline: "\n" });
  if (_startFenNeedsPgnHeaders(startFen)) {
    const esc = startFen.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    pgn = `[Event "Forum"]\n[SetUp "1"]\n[FEN "${esc}"]\n\n${pgn}`;
  }
  return pgn;
}

/** PGN 헤더에서 `[FEN "..."]` 값만 추출 (이스케이프된 따옴표·역슬래시 단순 복원). */
export function extractFenFromPgnHeaders(pgn: string): string | null {
  const m = pgn.match(/\[FEN\s+"((?:[^"\\]|\\.)*)"\]/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export type PgnReplayPosition = { fen: string; san: string };

/** PGN에서 수가 하나 이상이면 단계별 FEN·SAN 배열, 아니면 null. */
export function positionsFromPgnText(pgn: string): PgnReplayPosition[] | null {
  const trimmed = pgn?.trim();
  if (!trimmed) return null;
  try {
    const loaded = new Chess();
    loaded.loadPgn(trimmed, { strict: false });
    const hist = loaded.history({ verbose: true });
    if (hist.length === 0) return null;
    const fenHeader = extractFenFromPgnHeaders(trimmed);
    const startFen = fenHeader ?? DEFAULT_START_FEN;
    const base = loadChessRelaxed(startFen);
    if (!base) return null;
    const out: PgnReplayPosition[] = [{ fen: base.fen(), san: "" }];
    for (const m of hist) {
      const mv = base.move(m);
      if (!mv) return null;
      out.push({ fen: base.fen(), san: mv.san });
    }
    return out;
  } catch {
    return null;
  }
}

/** 목록/카드에서 `ForumPgnReplay`를 쓸 수 있는지 (최소 2개 국면 = 수 1수 이상) */
export function isForumPgnReplayable(pgn: string | null | undefined): boolean {
  const pos = positionsFromPgnText(pgn?.trim() ?? "");
  return Boolean(pos && pos.length >= 2);
}

/** PGN 본문에서 순서대로 UCI 문자열 배열 (편집 복원용). */
export function ucisFromPgnText(pgn: string): string[] | null {
  const trimmed = pgn?.trim();
  if (!trimmed) return null;
  try {
    const loaded = new Chess();
    loaded.loadPgn(trimmed, { strict: false });
    const hist = loaded.history({ verbose: true });
    if (hist.length === 0) return [];
    return hist.map((m) => m.from + m.to + (m.promotion ?? ""));
  } catch {
    return null;
  }
}

/** 시작 FEN + UCI로 SAN 배열 (작성 UI 수순 표시). */
export function sanListFromStartAndUcis(startFen: string, ucis: string[]): string[] {
  const board = loadChessRelaxed(startFen);
  if (!board) return [];
  const out: string[] = [];
  try {
    for (const uci of ucis) {
      const m = _uciToMove(uci);
      if (!m) break;
      let mv: ReturnType<Chess["move"]>;
      try {
        mv = board.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion as Move["promotion"],
        });
      } catch {
        break;
      }
      if (!mv) break;
      out.push(mv.san);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * PGN을 loadPgn한 뒤 되돌려, `ucisFromPgnText`와 동일한 기준의 시작 FEN을 얻습니다.
 * `fen_initial`과 헤더 FEN이 어긋난 경우에도 수 복원과 맞춥니다.
 */
export function startFenMatchingPgnUcis(pgn: string): string | null {
  const trimmed = pgn?.trim();
  if (!trimmed) return null;
  try {
    const loaded = new Chess();
    loaded.loadPgn(trimmed, { strict: false });
    const g = loaded;
    while (g.undo()) {
      /* to start */
    }
    return g.fen();
  } catch {
    return null;
  }
}
