"use client";

import Link from "next/link";

export default function RootErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="pixel-frame pixel-hud-fill overflow-hidden">
        <div className="border-b border-chess-border bg-chess-elevated/45 px-5 py-3">
          <p className="font-pixel text-[11px] uppercase tracking-wider text-chess-muted">Something Went Wrong</p>
        </div>
        <div className="space-y-3 px-5 py-8 text-center sm:px-7">
          <h1 className="font-pixel text-2xl font-bold tracking-wide text-chess-primary">Something went wrong</h1>
          <p className="text-sm leading-relaxed text-chess-muted">
            Please try again in a moment. If the problem continues, go back to Home and retry.
          </p>
          <p className="font-mono text-[11px] text-chess-muted/90">Error code: {error?.digest ?? "unknown"}</p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={reset}
              className="font-pixel pixel-btn bg-chess-accent px-4 py-2 text-xs font-semibold text-white border-chess-accent"
            >
              Retry
            </button>
            <Link
              href="/"
              className="font-pixel pixel-btn bg-chess-surface/80 px-4 py-2 text-xs text-chess-primary"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
