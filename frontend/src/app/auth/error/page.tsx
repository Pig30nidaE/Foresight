"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "로그인이 취소되었거나 권한 승인이 거부되었습니다.",
  OAuthCallbackError: "OAuth 인증이 취소되었거나 중간에 중단되었습니다.",
  OAuthSignin: "OAuth 로그인 시작 중 문제가 발생했습니다.",
  OAuthAccountNotLinked: "이미 다른 로그인 방식으로 가입된 계정입니다.",
};

function AuthErrorContent() {
  const params = useSearchParams();
  const error = params.get("error") ?? "Unknown";
  const message = ERROR_MESSAGES[error] ?? "로그인 처리 중 오류가 발생했습니다.";

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl border border-chess-border bg-chess-surface/70 p-6 text-center">
      <h1 className="text-xl font-bold text-chess-primary">로그인 오류</h1>
      <p className="mt-3 text-sm text-chess-muted">{message}</p>
      <p className="mt-2 text-xs text-chess-muted">오류 코드: {error}</p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <a
          href="/api/auth/signin?callbackUrl=%2Fpost-login"
          className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white"
        >
          다시 로그인
        </a>
        <Link
          href="/"
          className="rounded-md border border-chess-border px-4 py-2 text-sm text-chess-primary"
        >
          홈으로
        </Link>
      </div>
    </section>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<section className="mx-auto w-full max-w-xl p-6 text-center text-sm text-chess-muted">로딩 중...</section>}>
      <AuthErrorContent />
    </Suspense>
  );
}
