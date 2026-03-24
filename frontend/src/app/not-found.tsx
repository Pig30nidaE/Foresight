import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="pixel-frame pixel-hud-fill overflow-hidden">
        <div className="border-b border-chess-border bg-chess-elevated/45 px-5 py-3">
          <p className="font-pixel text-[11px] uppercase tracking-wider text-chess-muted">404 Not Found</p>
        </div>
        <div className="space-y-3 px-5 py-8 text-center sm:px-7">
          <h1 className="font-pixel text-2xl font-bold tracking-wide text-chess-primary">Page not found</h1>
          <p className="text-sm leading-relaxed text-chess-muted">
            The requested page does not exist or has moved. Please go back to Home.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            <Link
              href="/"
              className="font-pixel pixel-btn bg-chess-accent px-4 py-2 text-xs font-semibold text-white border-chess-accent"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
