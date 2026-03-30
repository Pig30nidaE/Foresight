"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function SignupVerifyEmailPage() {
  const router = useRouter();
  const { status } = useSession();
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/api/auth/signin?callbackUrl=%2Fpost-login");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setInfo("Email secondary verification was removed. Redirecting to sign-up.");
    const timer = window.setTimeout(() => {
      router.replace("/signup");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [status, router]);

  return (
    <section className="mx-auto w-full max-w-lg pixel-frame bg-chess-surface/75 p-6">
      <h1 className="text-xl font-bold text-chess-primary">Authentication Flow Updated</h1>
      <p className="mt-2 text-sm text-chess-muted">
        Email secondary verification is no longer used. You can continue sign-up directly with OAuth login.
      </p>
      {info && <p className="mt-3 text-sm text-chess-accent">{info}</p>}
    </section>
  );
}
