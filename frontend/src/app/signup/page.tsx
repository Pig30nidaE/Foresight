"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { TermsModal } from "@/shared/components/signup/TermsModal";
import api from "@/shared/lib/api";
import { apiErrorDetail } from "@/shared/lib/apiErrorDetail";
import { getBackendJwt } from "@/shared/lib/backendJwt";

type MeSignup = {
  signup_completed?: boolean;
  email_conflict?: boolean;
  masked_conflict_email?: string | null;
  needs_email_verification?: boolean;
  email_verified?: boolean;
};

export default function SignupPage() {
  const router = useRouter();
  const { status } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [meInfo, setMeInfo] = useState<MeSignup | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/api/auth/signin?callbackUrl=%2Fpost-login");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const run = async () => {
      try {
        const token = await getBackendJwt();
        if (!token) return;
        const { data } = await api.get<MeSignup>("/forum/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMeInfo(data ?? null);
        if (data?.signup_completed) {
          router.replace("/forum");
          return;
        }
        if (data?.needs_email_verification && !data?.email_verified) {
          router.replace("/signup/verify-email");
        }
      } catch {
        // ignore
      }
    };
    void run();
  }, [status, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const token = await getBackendJwt();
      if (!token) {
        throw new Error("로그인 토큰을 가져오지 못했습니다.");
      }
      await api.post(
        "/forum/signup",
        { display_name: displayName, agree_terms: agree },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      router.replace("/forum");
    } catch (err: unknown) {
      setError(apiErrorDetail(err));
    } finally {
      setBusy(false);
    }
  };

  const conflict = Boolean(meInfo?.email_conflict);
  const conflictMsg = meInfo?.masked_conflict_email
    ? `${meInfo.masked_conflict_email}(으)로 이미 가입되어 있습니다. 기존에 사용하던 로그인 수단으로 들어가 주세요.`
    : "이미 가입된 이메일입니다. 기존에 사용하던 로그인 수단으로 들어가 주세요.";

  return (
    <section className="mx-auto w-full max-w-lg pixel-frame bg-chess-surface/75 p-6">
      <h1 className="text-xl font-bold text-chess-primary">회원가입 완료</h1>
      <p className="mt-2 text-sm text-chess-muted">
        포럼 쓰기 기능을 이용하려면 닉네임과 약관 동의를 완료해 주세요.
      </p>
      {conflict && (
        <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {conflictMsg}
        </p>
      )}
      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="block text-sm font-medium text-chess-primary">닉네임</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={50}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={conflict}
            className="mt-1 w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="text-sm font-medium text-chess-accent underline-offset-2 hover:underline"
          >
            이용약관·개인정보·커뮤니티 규칙 전문 보기
          </button>
          <label className="flex items-center gap-2 text-sm text-chess-primary">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              disabled={conflict}
            />
            위 내용을 확인하였으며 이용약관과 커뮤니티 규칙에 동의합니다.
          </label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || !agree || conflict}
          className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "처리 중..." : "가입 완료"}
        </button>
      </form>
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </section>
  );
}
