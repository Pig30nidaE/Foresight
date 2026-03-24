"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect } from "react";

import api from "@/shared/lib/api";
import { clearBackendJwtCache, getBackendJwt } from "@/shared/lib/backendJwt";

type MeSignup = {
  signup_completed?: boolean;
  email_conflict?: boolean;
  needs_email_verification?: boolean;
  email_verified?: boolean;
};

export default function SignupConsentPage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const run = async () => {
      try {
        const token = await getBackendJwt();
        if (!token) return;
        const { data } = await api.get("/forum/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data?.signup_completed) {
          router.replace("/forum");
        }
      } catch {
        // ignore; user may still need consent
      }
    };
    void run();
  }, [status, router]);

  const onReject = async () => {
    clearBackendJwtCache();
    await signOut({ callbackUrl: "/" });
  };

  return (
    <section className="mx-auto w-full max-w-xl pixel-frame bg-chess-surface/75 p-6 text-center">
      <h1 className="text-xl font-bold text-chess-primary">회원가입 동의</h1>
      <p className="mt-3 text-sm text-chess-muted">
        이 계정은 처음 로그인했습니다. 회원가입을 진행하시겠습니까?
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={async () => {
            try {
              const token = await getBackendJwt();
              if (!token) {
                router.push("/signup");
                return;
              }
              const { data } = await api.get<MeSignup>("/forum/me", {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (data?.signup_completed) {
                router.replace("/forum");
                return;
              }
              if (data?.needs_email_verification && !data?.email_verified) {
                router.push("/signup/verify-email");
                return;
              }
              router.push("/signup");
            } catch {
              router.push("/signup");
            }
          }}
          className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white"
        >
          회원가입 진행
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-md border border-chess-border px-4 py-2 text-sm text-chess-primary"
        >
          거부하고 나가기
        </button>
      </div>
    </section>
  );
}
