"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <main className="mx-auto w-full max-w-2xl px-4 py-10">
          <section className="pixel-frame pixel-hud-fill overflow-hidden">
            <div className="border-b border-chess-border bg-chess-elevated/45 px-5 py-3">
              <p className="font-pixel text-[11px] uppercase tracking-wider text-chess-muted">Global Error</p>
            </div>
            <div className="space-y-3 px-5 py-8 text-center sm:px-7">
              <h1 className="font-pixel text-2xl font-bold tracking-wide text-chess-primary">A critical error occurred</h1>
              <p className="text-sm leading-relaxed text-chess-muted">
                Reload the app or try again in a moment.
              </p>
              <p className="font-mono text-[11px] text-chess-muted/90">Error code: {error?.digest ?? "unknown"}</p>
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={reset}
                  className="font-pixel pixel-btn bg-chess-accent px-4 py-2 text-xs font-semibold text-white border-chess-accent"
                >
                  Retry
                </button>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
