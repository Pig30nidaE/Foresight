"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation, type I18nKey } from "@/shared/lib/i18n";

const ERROR_KEY_MAP: Record<string, I18nKey> = {
  AccessDenied: "auth.error.AccessDenied",
  OAuthCallbackError: "auth.error.OAuthCallbackError",
  OAuthSignin: "auth.error.OAuthSignin",
  OAuthAccountNotLinked: "auth.error.OAuthAccountNotLinked",
};

function AuthErrorContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const error = params.get("error") ?? "Unknown";
  const messageKey = ERROR_KEY_MAP[error] ?? "auth.error.generic";
  const message = t(messageKey);

  return (
    <section className="mx-auto w-full max-w-xl">
      <div className="pixel-frame pixel-hud-fill overflow-hidden">
        <div className="border-b border-chess-border bg-chess-elevated/45 px-5 py-3">
          <p className="font-pixel text-[11px] uppercase tracking-wider text-chess-muted">Auth</p>
        </div>
        <div className="space-y-3 px-5 py-6 text-center sm:px-7">
          <h1 className="font-pixel text-xl font-bold tracking-wide text-chess-primary sm:text-2xl">{t("auth.error.title")}</h1>
          <p className="text-sm leading-relaxed text-chess-muted">{message}</p>
          <p className="font-mono text-[11px] text-chess-muted/90">code: {error}</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <Link
              href="/api/auth/signin?callbackUrl=%2Fpost-login"
              className="font-pixel pixel-btn bg-chess-accent px-4 py-2 text-xs font-semibold text-white border-chess-accent hover:brightness-105"
            >
              {t("auth.error.signInAgain")}
            </Link>
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) router.back();
                else router.push("/");
              }}
              className="font-pixel pixel-btn bg-chess-surface/80 px-4 py-2 text-xs text-chess-primary"
            >
              {t("auth.error.backHome")}
            </button>
            <Link
              href="/"
              className="font-pixel pixel-btn bg-chess-surface/80 px-4 py-2 text-xs text-chess-primary"
            >
              {t("nav.home")}
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-chess-muted">{t("auth.error.retryHint")}</p>
      <div className="mt-2 flex justify-center">
        <Link
          href="/api/auth/signin?callbackUrl=%2Fpost-login"
          className="font-pixel text-[11px] text-chess-accent underline decoration-2 underline-offset-2 hover:brightness-110"
        >
          {t("auth.error.openSignIn")}
        </Link>
      </div>
    </section>
  );
}

export default function AuthErrorPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <section className="mx-auto w-full max-w-xl p-6 text-center text-sm text-chess-muted">{t("forum.loadingShort")}</section>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
