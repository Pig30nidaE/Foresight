/** Pixel-aligned decorative icons (SVG), no emoji — arcade HUD style */

export function PixelSearchIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none shrink-0 ${className}`}
      viewBox="0 0 16 16"
      aria-hidden
      style={{ imageRendering: "pixelated" }}
    >
      <g fill="var(--color-chess-muted)">
        <rect x="4" y="2" width="5" height="1" />
        <rect x="3" y="3" width="1" height="5" />
        <rect x="9" y="3" width="1" height="5" />
        <rect x="4" y="8" width="5" height="1" />
        <rect x="5" y="4" width="3" height="3" fill="var(--color-chess-surface)" />
      </g>
      <g fill="var(--color-chess-primary)">
        <rect x="10" y="10" width="2" height="2" />
        <rect x="12" y="12" width="2" height="2" />
        <rect x="14" y="14" width="2" height="2" />
      </g>
    </svg>
  );
}

export function PixelStickerFace({ kind }: { kind: "HOT" | "LOL" | "RIP" | "MVP" }) {
  const common = "shrink-0 overflow-visible";
  if (kind === "HOT") {
    return (
      <svg className={common} width={14} height={14} viewBox="0 0 14 14" aria-hidden style={{ imageRendering: "pixelated" }}>
        <rect width="14" height="14" fill="#b45309" />
        <path fill="#fbbf24" d="M3 10h8v2H3v-2zm1-6h1v3H4V4zm6 0h1v3h-1V4z" />
        <path fill="#fef08a" d="M5 7h4v1H5V7z" />
      </svg>
    );
  }
  if (kind === "LOL") {
    return (
      <svg className={common} width={14} height={14} viewBox="0 0 14 14" aria-hidden style={{ imageRendering: "pixelated" }}>
        <rect width="14" height="14" fill="#6b21a8" />
        <rect x="3" y="4" width="2" height="2" fill="#fef9c3" />
        <rect x="9" y="4" width="2" height="2" fill="#fef9c3" />
        <path fill="#fde047" d="M3 9h8v2H3V9z" />
      </svg>
    );
  }
  if (kind === "RIP") {
    return (
      <svg className={common} width={14} height={14} viewBox="0 0 14 14" aria-hidden style={{ imageRendering: "pixelated" }}>
        <rect width="14" height="14" fill="#3f3f46" />
        <rect x="5" y="2" width="4" height="2" fill="#e4e4e7" />
        <rect x="4" y="5" width="6" height="1" fill="#a1a1aa" />
        <rect x="3" y="7" width="8" height="4" fill="#52525b" />
      </svg>
    );
  }
  /* MVP */
  return (
    <svg className={common} width={14} height={14} viewBox="0 0 14 14" aria-hidden style={{ imageRendering: "pixelated" }}>
      <rect width="14" height="14" fill="#1e3a5f" />
      <path fill="#fbbf24" d="M7 2l1 3h3l-2 2 1 3-3-2-3 2 1-3-2-2h3l1-3z" />
    </svg>
  );
}
