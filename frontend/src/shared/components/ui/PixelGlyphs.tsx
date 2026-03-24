"use client";

import type { ComponentType, SVGAttributes } from "react";

type GProps = SVGAttributes<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  style: { imageRendering: "pixelated" as const },
  "aria-hidden": true as const,
});

/** 16×16 그리드, currentColor — 이모지 대체용 */
export function PixelPawnGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.2em] text-chess-primary ${className}`}>
      <g fill="currentColor">
        <rect x="7" y="2" width="2" height="2" />
        <rect x="6" y="4" width="4" height="2" />
        <rect x="5" y="6" width="6" height="2" />
        <rect x="6" y="8" width="4" height="3" />
        <rect x="5" y="11" width="6" height="2" />
        <rect x="4" y="13" width="8" height="1" />
      </g>
    </svg>
  );
}

export function PixelHeartGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="4" y="3" width="2" height="2" />
        <rect x="10" y="3" width="2" height="2" />
        <rect x="3" y="5" width="10" height="2" />
        <rect x="4" y="7" width="8" height="2" />
        <rect x="5" y="9" width="6" height="2" />
        <rect x="6" y="11" width="4" height="2" />
        <rect x="7" y="13" width="2" height="1" />
      </g>
    </svg>
  );
}

export function PixelChatGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="3" width="12" height="8" />
        <rect x="3" y="4" width="10" height="1" opacity={0.35} />
        <rect x="3" y="6" width="10" height="1" opacity={0.35} />
        <rect x="3" y="8" width="7" height="1" opacity={0.35} />
        <rect x="4" y="11" width="4" height="2" />
        <rect x="3" y="12" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelCrownGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] text-chess-accent ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="10" width="12" height="2" />
        <rect x="3" y="8" width="10" height="2" />
        <rect x="2" y="4" width="2" height="4" />
        <rect x="7" y="2" width="2" height="6" />
        <rect x="12" y="4" width="2" height="4" />
        <rect x="5" y="5" width="2" height="3" />
        <rect x="9" y="5" width="2" height="3" />
      </g>
    </svg>
  );
}

export function PixelWarnGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] text-chess-warn ${className}`}>
      <g fill="currentColor">
        <rect x="7" y="3" width="2" height="8" />
        <rect x="6" y="4" width="4" height="1" opacity="0.85" />
        <rect x="5" y="5" width="6" height="1" opacity="0.7" />
        <rect x="4" y="6" width="8" height="1" opacity="0.55" />
        <rect x="3" y="7" width="10" height="1" opacity="0.4" />
        <rect x="2" y="8" width="12" height="1" opacity="0.25" />
        <rect x="7" y="12" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelXGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="3" width="2" height="2" />
        <rect x="11" y="3" width="2" height="2" />
        <rect x="5" y="5" width="2" height="2" />
        <rect x="9" y="5" width="2" height="2" />
        <rect x="7" y="7" width="2" height="2" />
        <rect x="5" y="9" width="2" height="2" />
        <rect x="9" y="9" width="2" height="2" />
        <rect x="3" y="11" width="2" height="2" />
        <rect x="11" y="11" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelBarrierGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] text-amber-600 dark:text-amber-400 ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="6" width="12" height="2" />
        <rect x="2" y="10" width="12" height="2" />
        <rect x="3" y="4" width="2" height="10" />
        <rect x="7" y="4" width="2" height="10" />
        <rect x="11" y="4" width="2" height="10" />
      </g>
    </svg>
  );
}

export function PixelBoltGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="6" y="1" width="3" height="2" />
        <rect x="5" y="3" width="3" height="2" />
        <rect x="4" y="5" width="3" height="3" />
        <rect x="7" y="7" width="3" height="2" />
        <rect x="6" y="9" width="3" height="2" />
        <rect x="5" y="11" width="3" height="2" />
      </g>
    </svg>
  );
}

export function PixelClockGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="2" width="8" height="1" />
        <rect x="2" y="3" width="1" height="8" />
        <rect x="11" y="3" width="1" height="8" />
        <rect x="3" y="11" width="8" height="1" />
        <rect x="7" y="4" width="1" height="4" />
        <rect x="7" y="7" width="3" height="1" />
      </g>
    </svg>
  );
}

export function PixelBookGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="2" width="8" height="11" />
        <rect x="4" y="3" width="6" height="1" opacity={0.4} />
        <rect x="4" y="5" width="6" height="1" opacity={0.4} />
        <rect x="4" y="7" width="6" height="1" opacity={0.4} />
        <rect x="2" y="1" width="2" height="13" />
      </g>
    </svg>
  );
}

export function PixelTargetGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="7" y="1" width="2" height="3" />
        <rect x="7" y="12" width="2" height="3" />
        <rect x="1" y="7" width="3" height="2" />
        <rect x="12" y="7" width="3" height="2" />
        <rect x="3" y="3" width="10" height="1" />
        <rect x="3" y="12" width="10" height="1" />
        <rect x="3" y="3" width="1" height="10" />
        <rect x="12" y="3" width="1" height="10" />
        <rect x="7" y="7" width="2" height="2" />
      </g>
    </svg>
  );
}

/** 십자 탄환 — 불릿 타입 */
export function PixelBulletGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="6" y="2" width="2" height="10" />
        <rect x="2" y="6" width="10" height="2" />
      </g>
    </svg>
  );
}

export function PixelChartGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="12" width="12" height="2" />
        <rect x="3" y="8" width="2" height="4" />
        <rect x="7" y="5" width="2" height="7" />
        <rect x="11" y="7" width="2" height="5" />
      </g>
    </svg>
  );
}

export function PixelLinkGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="6" width="5" height="2" />
        <rect x="9" y="6" width="5" height="2" />
        <rect x="4" y="4" width="2" height="2" />
        <rect x="10" y="8" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelMagnifyGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="2" width="6" height="1" />
        <rect x="2" y="3" width="1" height="6" />
        <rect x="9" y="3" width="1" height="6" />
        <rect x="3" y="8" width="6" height="1" />
        <rect x="10" y="10" width="2" height="2" />
        <rect x="12" y="12" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelCheckGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] text-chess-win ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="8" width="2" height="2" />
        <rect x="4" y="10" width="2" height="2" />
        <rect x="6" y="8" width="2" height="2" />
        <rect x="8" y="6" width="2" height="2" />
        <rect x="10" y="4" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelCrossMarkGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] text-chess-loss ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="2" width="3" height="3" />
        <rect x="9" y="9" width="3" height="3" />
        <rect x="9" y="2" width="3" height="3" />
        <rect x="2" y="9" width="3" height="3" />
        <rect x="5" y="5" width="4" height="4" />
      </g>
    </svg>
  );
}

export function PixelInboxGlyph({ className = "", size = 20 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block opacity-50 ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="5" width="14" height="10" />
        <rect x="5" y="7" width="10" height="6" opacity={0.35} />
        <rect x="1" y="3" width="18" height="2" />
      </g>
    </svg>
  );
}

export function PixelRobotGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="4" y="4" width="8" height="8" />
        <rect x="3" y="6" width="1" height="4" />
        <rect x="12" y="6" width="1" height="4" />
        <rect x="6" y="6" width="2" height="2" opacity={0.35} />
        <rect x="8" y="6" width="2" height="2" opacity={0.35} />
        <rect x="5" y="12" width="6" height="2" />
      </g>
    </svg>
  );
}

/** 작은 호박색 다이아몬드 (중간 위험) */
export function PixelDiamondGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] text-amber-600 dark:text-amber-400 ${className}`}>
      <g fill="currentColor">
        <rect x="6" y="2" width="2" height="2" />
        <rect x="4" y="4" width="6" height="2" />
        <rect x="2" y="6" width="10" height="2" />
        <rect x="4" y="8" width="6" height="2" />
        <rect x="6" y="10" width="2" height="2" />
      </g>
    </svg>
  );
}

/** 흰색 진영 킹 실루엣 (보드 표시용) */
export function PixelKingWhiteGlyph({ className = "", size = 18 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="7" y="1" width="2" height="2" />
        <rect x="6" y="3" width="4" height="2" />
        <rect x="5" y="5" width="6" height="3" />
        <rect x="4" y="8" width="8" height="4" />
        <rect x="3" y="12" width="10" height="2" />
      </g>
    </svg>
  );
}

/** 검은 진영 킹 실루엣 */
export function PixelKingBlackGlyph({ className = "", size = 18 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="7" y="1" width="2" height="2" />
        <rect x="6" y="3" width="4" height="2" />
        <rect x="5" y="5" width="6" height="3" />
        <rect x="4" y="8" width="8" height="4" />
        <rect x="3" y="12" width="10" height="2" />
      </g>
    </svg>
  );
}

export function PixelFolderGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="4" width="12" height="9" />
        <rect x="2" y="3" width="5" height="2" />
        <rect x="3" y="6" width="10" height="6" opacity={0.2} />
      </g>
    </svg>
  );
}

export function PixelFlagGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="2" width="1" height="12" />
        <rect x="4" y="2" width="7" height="5" />
      </g>
    </svg>
  );
}

export function PixelDiceGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="3" width="8" height="8" />
        <rect x="5" y="5" width="1" height="1" opacity={0.25} />
        <rect x="8" y="5" width="1" height="1" opacity={0.25} />
        <rect x="5" y="8" width="1" height="1" opacity={0.25} />
        <rect x="8" y="8" width="1" height="1" opacity={0.25} />
      </g>
    </svg>
  );
}

export function PixelTrophyGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] text-chess-accent ${className}`}>
      <g fill="currentColor">
        <rect x="5" y="2" width="6" height="2" />
        <rect x="4" y="4" width="8" height="4" />
        <rect x="6" y="8" width="4" height="2" />
        <rect x="5" y="10" width="6" height="2" />
        <rect x="7" y="12" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelHourglassGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] ${className}`}>
      <g fill="currentColor">
        <rect x="5" y="2" width="6" height="2" />
        <rect x="4" y="4" width="8" height="2" />
        <rect x="6" y="6" width="4" height="4" />
        <rect x="4" y="10" width="8" height="2" />
        <rect x="5" y="12" width="6" height="2" />
      </g>
    </svg>
  );
}

export function PixelMicroscopeGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="10" width="8" height="2" />
        <rect x="8" y="6" width="2" height="6" />
        <rect x="6" y="4" width="4" height="3" />
        <rect x="10" y="8" width="3" height="2" />
      </g>
    </svg>
  );
}

export function PixelSwordsGlyph({ className = "", size = 14 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="2" width="2" height="8" />
        <rect x="4" y="2" width="3" height="2" />
        <rect x="10" y="4" width="2" height="8" />
        <rect x="7" y="4" width="3" height="2" />
      </g>
    </svg>
  );
}

export function PixelStarGlyph({ className = "", size = 12 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.1em] text-chess-win ${className}`}>
      <g fill="currentColor">
        <rect x="5" y="1" width="2" height="2" />
        <rect x="3" y="3" width="6" height="2" />
        <rect x="2" y="5" width="8" height="2" />
        <rect x="4" y="7" width="4" height="2" />
        <rect x="5" y="9" width="2" height="2" />
      </g>
    </svg>
  );
}

/** 접기/펼치기·이전/다음 등 방향 표시 (16×16, 이모지/유니코드 삼각형 대체) */
/** 꼭짓점이 위(▲) */
export function PixelCaretUpGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] text-chess-muted ${className}`}>
      <g fill="currentColor">
        <rect x="3" y="2" width="10" height="2" />
        <rect x="5" y="4" width="6" height="2" />
        <rect x="6" y="6" width="4" height="2" />
        <rect x="7" y="8" width="2" height="2" />
      </g>
    </svg>
  );
}

/** 꼭짓점이 아래(▼) */
export function PixelCaretDownGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] text-chess-muted ${className}`}>
      <g fill="currentColor">
        <rect x="7" y="2" width="2" height="2" />
        <rect x="5" y="4" width="6" height="2" />
        <rect x="3" y="6" width="10" height="2" />
        <rect x="5" y="8" width="6" height="2" />
      </g>
    </svg>
  );
}

export function PixelCaretLeftGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] text-chess-muted ${className}`}>
      <g fill="currentColor">
        <rect x="2" y="7" width="2" height="2" />
        <rect x="4" y="6" width="2" height="4" />
        <rect x="6" y="5" width="2" height="6" />
        <rect x="8" y="4" width="2" height="8" />
      </g>
    </svg>
  );
}

export function PixelCaretRightGlyph({ className = "", size = 16 }: GProps) {
  return (
    <svg {...base(size)} className={`shrink-0 inline-block align-[-0.15em] text-chess-muted ${className}`}>
      <g fill="currentColor">
        <rect x="12" y="7" width="2" height="2" />
        <rect x="10" y="6" width="2" height="4" />
        <rect x="8" y="5" width="2" height="6" />
        <rect x="6" y="4" width="2" height="8" />
      </g>
    </svg>
  );
}

/** 탭/맵 등에서 쓰는 아이콘 컴포넌트 타입 */
export type PixelGlyphComponent = ComponentType<GProps>;
