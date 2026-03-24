"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Sign-in was cancelled or permission was denied.",
  OAuthCallbackError: "OAuth authentication was cancelled or interrupted.",
  OAuthSignin: "An error occurred while starting OAuth sign-in.",
  OAuthAccountNotLinked: "This account already exists with a different sign-in method.",
};

function AuthErrorContent() {
  const params = useSearchParams();
  const error = params.get("error") ?? "Unknown";
  const message = ERROR_MESSAGES[error] ?? "An error occurred while processing sign-in.";

  return (
    <section className="mx-auto w-full max-w-xl">
      <div className="pixel-frame pixel-hud-fill overflow-hidden">
        <div className="border-b border-chess-border bg-chess-elevated/45 px-5 py-3">
          <p className="font-pixel text-[11px] uppercase tracking-wider text-chess-muted">Authentication</p>
        </div>
        <div className="space-y-3 px-5 py-6 text-center sm:px-7">
          <h1 className="font-pixel text-xl font-bold tracking-wide text-chess-primary sm:text-2xl">Authentication Error</h1>
          <p className="text-sm leading-relaxed text-chess-muted">{message}</p>
          <p className="font-mono text-[11px] text-chess-muted/90">Error code: {error}</p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="/api/auth/signin?callbackUrl=%2Fpost-login"
              className="font-pixel pixel-btn bg-chess-accent px-4 py-2 text-xs font-semibold text-white border-chess-accent hover:brightness-105"
            >
              Sign in again
            </a>
            <Link
              href="/"
              className="font-pixel pixel-btn bg-chess-surface/80 px-4 py-2 text-xs text-chess-primary"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-chess-muted">Please try again in a moment.</p>
      <div className="mt-2 flex justify-center">
        <a
          href="/api/auth/signin?callbackUrl=%2Fpost-login"
          className="font-pixel text-[11px] text-chess-accent underline decoration-2 underline-offset-2 hover:brightness-110"
        >
          Open sign-in page directly
        </a>
      </div>
    </section>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<section className="mx-auto w-full max-w-xl p-6 text-center text-sm text-chess-muted">Loading...</section>}>
      <AuthErrorContent />
    </Suspense>
  );
}
