/** Decorative 32×32-style knight + pawn HUD sprites (no interaction). */
export function DashboardPixelMascot({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none select-none ${className}`}
      width={44}
      height={36}
      viewBox="0 0 32 28"
      aria-hidden
      style={{ imageRendering: "pixelated" }}
    >
      {/* Pawn (left) */}
      <rect x="2" y="22" width="8" height="2" fill="var(--color-chess-piece-b)" />
      <rect x="3" y="20" width="6" height="2" fill="var(--color-chess-piece-b)" />
      <rect x="4" y="14" width="4" height="6" fill="var(--color-chess-piece-b)" />
      <rect x="3" y="12" width="6" height="2" fill="var(--color-chess-piece-b)" />
      <rect x="4" y="10" width="4" height="2" fill="var(--color-chess-muted)" />
      <rect x="5" y="8" width="2" height="2" fill="var(--color-chess-piece-b)" />
      {/* Knight (right) */}
      <rect x="14" y="22" width="10" height="2" fill="var(--color-chess-piece-b)" />
      <rect x="15" y="20" width="8" height="2" fill="var(--color-chess-piece-b)" />
      <rect x="16" y="16" width="6" height="4" fill="var(--color-chess-piece-b)" />
      <rect x="18" y="10" width="4" height="6" fill="var(--color-chess-piece-b)" />
      <rect x="20" y="6" width="3" height="5" fill="var(--color-chess-piece-b)" />
      <rect x="22" y="4" width="2" height="3" fill="var(--color-chess-piece-b)" />
      <rect x="24" y="2" width="2" height="3" fill="var(--color-chess-piece-b)" />
      <rect x="17" y="12" width="2" height="2" fill="var(--color-chess-accent)" />
      <rect x="19" y="8" width="2" height="2" fill="var(--color-chess-accent)" />
      <rect x="21" y="6" width="2" height="2" fill="var(--color-chess-piece-w)" opacity={0.35} />
      <rect x="5" y="16" width="2" height="2" fill="var(--color-chess-accent)" />
    </svg>
  );
}
