import type { CSSProperties } from "react";

/** 백엔드 `forum_board_annotations.ALLOWED_HIGHLIGHT_COLORS` 와 동일해야 함 */
export const FORUM_ANNOTATION_COLORS = [
  { value: "rgba(255,220,100,0.45)", key: "amber" },
  { value: "rgba(100,180,255,0.45)", key: "blue" },
  { value: "rgba(255,100,100,0.45)", key: "red" },
  { value: "rgba(180,255,180,0.45)", key: "green" },
] as const;

export const FORUM_ANNOTATION_EMOJIS = [
  "!",
  "?",
  "!!",
  "?!",
  "#",
  "♟",
  "💡",
  "⚔",
  "🔥",
  "TF",
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
] as const;

/** 체스 기호·티어 칩(TF~T6) — 보드·피커에서 동일 색상 */
export const FORUM_ANNOTATION_SYMBOL_COLORS: Record<string, string> = {
  "!": "#38bdf8",
  "?": "#fbbf24",
  "!!": "#22d3ee",
  "?!": "#a78bfa",
  "#": "#ef4444",
  TF: "#fcd34d",
  T1: "#4ade80",
  T2: "#2dd4bf",
  T3: "#38bdf8",
  T4: "#818cf8",
  T5: "#f97316",
  T6: "#64748b",
};

export type PlyAnnotationLayer = {
  highlights: Record<string, string>;
  emojis: Record<string, string>;
};

export type BoardAnnotations = {
  highlights: Record<string, string>;
  emojis: Record<string, string>;
  /** 수순 재생 시 해당 반수 인덱스 이하에서만 합성 (키: "0" …) */
  byPly?: Record<string, PlyAnnotationLayer>;
};

export function emptyBoardAnnotations(): BoardAnnotations {
  return { highlights: {}, emojis: {}, byPly: {} };
}

function normalizePlyLayer(raw: unknown): PlyAnnotationLayer {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { highlights: {}, emojis: {} };
  }
  const o = raw as Record<string, unknown>;
  const h = o.highlights;
  const e = o.emojis;
  return {
    highlights:
      h && typeof h === "object" && !Array.isArray(h) ? { ...(h as Record<string, string>) } : {},
    emojis: e && typeof e === "object" && !Array.isArray(e) ? { ...(e as Record<string, string>) } : {},
  };
}

export function normalizeBoardAnnotationsFromApi(raw: unknown): BoardAnnotations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { highlights: {}, emojis: {}, byPly: {} };
  }
  const o = raw as Record<string, unknown>;
  const h = o.highlights;
  const e = o.emojis;
  const bp = o.byPly;
  const byPly: Record<string, PlyAnnotationLayer> = {};
  if (bp && typeof bp === "object" && !Array.isArray(bp)) {
    for (const [k, v] of Object.entries(bp)) {
      if (/^\d+$/.test(k)) byPly[k] = normalizePlyLayer(v);
    }
  }
  return {
    highlights:
      h && typeof h === "object" && !Array.isArray(h) ? { ...(h as Record<string, string>) } : {},
    emojis: e && typeof e === "object" && !Array.isArray(e) ? { ...(e as Record<string, string>) } : {},
    byPly: Object.keys(byPly).length ? byPly : {},
  };
}

/**
 * 재생/특정 국면 표시: 전역 레이어 + 해당 `replayIndex`의 byPly 한 겹만 (누적 없음).
 * `replayIndex`는 ForumPgnReplay의 idx와 동일 — 0이 시작, k는 k수 후 국면.
 */
export function mergeAnnotationsForReplayIndex(ann: BoardAnnotations, replayIndex: number): BoardAnnotations {
  const highlights = { ...ann.highlights };
  const emojis = { ...ann.emojis };
  const layer = ann.byPly?.[String(replayIndex)];
  if (layer) {
    Object.assign(highlights, layer.highlights);
    Object.assign(emojis, layer.emojis);
  }
  return { highlights, emojis };
}

/** 편집기 미리보기 등: 전역 + 특정 반수 byPly 한 겹만 */
export function mergeAnnotationsForEditPly(ann: BoardAnnotations, ply: number): BoardAnnotations {
  return mergeAnnotationsForReplayIndex(ann, ply);
}

/** 수 기록 중: 레이아웃용 전역 + 해당 반수(`moveCount`)에만 찍은 byPly만 (이전 수의 마크는 숨김) */
export function mergeAnnotationsForRecordCurrentPly(ann: BoardAnnotations, moveCount: number): BoardAnnotations {
  const layer = ann.byPly?.[String(moveCount)];
  return {
    highlights: { ...ann.highlights, ...(layer?.highlights ?? {}) },
    emojis: { ...ann.emojis, ...(layer?.emojis ?? {}) },
  };
}

export function isBoardAnnotationsEmpty(a: BoardAnnotations): boolean {
  if (Object.keys(a.highlights).length > 0 || Object.keys(a.emojis).length > 0) return false;
  const bp = a.byPly ?? {};
  for (const layer of Object.values(bp)) {
    if (Object.keys(layer.highlights).length > 0 || Object.keys(layer.emojis).length > 0) return false;
  }
  return true;
}

export function boardAnnotationsToPayload(a: BoardAnnotations): {
  highlights: Record<string, string>;
  emojis: Record<string, string>;
  byPly?: Record<string, PlyAnnotationLayer>;
} | null {
  if (isBoardAnnotationsEmpty(a)) return null;
  const out: {
    highlights: Record<string, string>;
    emojis: Record<string, string>;
    byPly?: Record<string, PlyAnnotationLayer>;
  } = { highlights: { ...a.highlights }, emojis: { ...a.emojis } };
  if (a.byPly && Object.keys(a.byPly).length > 0) out.byPly = { ...a.byPly };
  return out;
}

function stripForCompare(a: BoardAnnotations): unknown {
  const bp = a.byPly ?? {};
  const cleaned: Record<string, PlyAnnotationLayer> = {};
  for (const [k, v] of Object.entries(bp)) {
    if (Object.keys(v.highlights).length || Object.keys(v.emojis).length) cleaned[k] = v;
  }
  return {
    highlights: a.highlights,
    emojis: a.emojis,
    byPly: Object.keys(cleaned).length ? cleaned : undefined,
  };
}

export function boardAnnotationsEqual(a: BoardAnnotations, b: BoardAnnotations): boolean {
  return JSON.stringify(stripForCompare(a)) === JSON.stringify(stripForCompare(b));
}

export function highlightsToSquareStyles(highlights: Record<string, string>): Record<string, CSSProperties> {
  const out: Record<string, CSSProperties> = {};
  for (const [sq, color] of Object.entries(highlights)) {
    out[sq] = { backgroundColor: color };
  }
  return out;
}


/**
 * `byPly` 키(기록 시점의 `moveUcis.length`)가 `lastMoveCount`를 넘는 버킷만 제거.
 * `lastMoveCount === -1`이면 byPly 전부 제거(FEN 초기화·기록 취소 등).
 */
export function pruneAnnotationsBeyondPly(ann: BoardAnnotations, lastMoveCount: number): BoardAnnotations {
  const bp = { ...(ann.byPly ?? {}) };
  for (const k of Object.keys(bp)) {
    const n = Number(k);
    if (!Number.isFinite(n) || n > lastMoveCount) delete bp[k];
  }
  return {
    highlights: { ...ann.highlights },
    emojis: { ...ann.emojis },
    byPly: Object.keys(bp).length ? bp : {},
  };
}
