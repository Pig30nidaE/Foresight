"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import api from "@/shared/lib/api";
import { apiErrorDetail } from "@/shared/lib/apiErrorDetail";
import { getBackendJwt } from "@/shared/lib/backendJwt";

type MeSignup = {
  signup_completed?: boolean;
  email?: string | null;
  email_conflict?: boolean;
  masked_conflict_email?: string | null;
  needs_email_verification?: boolean;
  email_verified?: boolean;
};

function maskHint(email: string | null | undefined): string {
  if (!email?.trim()) return "";
  const e = email.trim();
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const keep = Math.min(2, local.length);
  const prefix = local.slice(0, keep);
  const stars = "*".repeat(Math.max(3, local.length - keep));
  return `${prefix}${stars}@${domain}`;
}

export default function SignupVerifyEmailPage() {
  const router = useRouter();
  const { status } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [me, setMe] = useState<MeSignup | null>(null);
  const autoRequestStarted = useRef(false);

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
        setMe(data ?? null);
        if (!data) return;
        if (data.signup_completed) {
          router.replace("/forum");
          return;
        }
        if (data.email_conflict) return;
        if (!data.needs_email_verification || data.email_verified) {
          router.replace("/signup");
          return;
        }
        if (autoRequestStarted.current) return;
        autoRequestStarted.current = true;
        setRequestBusy(true);
        setError(null);
        try {
          await api.post(
            "/forum/signup/email-code/request",
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setInfo("등록된 이메일로 인증 코드를 보냈습니다. 메일함을 확인해 주세요.");
        } catch (err: unknown) {
          setError(apiErrorDetail(err));
        } finally {
          setRequestBusy(false);
        }
      } catch {
        // ignore
      }
    };
    void run();
  }, [status, router]);

  const resend = async () => {
    setError(null);
    setInfo(null);
    setRequestBusy(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error("로그인 토큰을 가져오지 못했습니다.");
      await api.post("/forum/signup/email-code/request", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInfo("인증 코드를 다시 보냈습니다.");
    } catch (err: unknown) {
      setError(apiErrorDetail(err));
    } finally {
      setRequestBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error("로그인 토큰을 가져오지 못했습니다.");
      const digits = code.replace(/\D/g, "").slice(0, 6);
      await api.post(
        "/forum/signup/email-code/verify",
        { code: digits },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      router.replace("/signup");
    } catch (err: unknown) {
      setError(apiErrorDetail(err));
    } finally {
      setBusy(false);
    }
  };

  if (me?.email_conflict) {
    const msg = me.masked_conflict_email
      ? `${me.masked_conflict_email}(으)로 이미 가입되어 있습니다.`
      : "이미 가입된 이메일입니다.";
    return (
      <section className="mx-auto w-full max-w-lg pixel-frame bg-chess-surface/75 p-6">
        <h1 className="text-xl font-bold text-chess-primary">가입할 수 없습니다</h1>
        <p className="mt-3 text-sm text-red-200">{msg}</p>
        <p className="mt-2 text-sm text-chess-muted">기존에 연동한 소셜 로그인으로 다시 들어와 주세요.</p>
      </section>
    );
  }

  const hint = maskHint(me?.email ?? null);

  return (
    <section className="mx-auto w-full max-w-lg pixel-frame bg-chess-surface/75 p-6">
      <h1 className="text-xl font-bold text-chess-primary">이메일 인증</h1>
      <p className="mt-2 text-sm text-chess-muted">
        회원가입을 마치려면 등록된 이메일로 보낸 6자리 코드를 입력해 주세요.
      </p>
      {hint && (
        <p className="mt-2 text-sm text-chess-primary">
          발송 대상: <span className="font-mono text-chess-accent">{hint}</span>
        </p>
      )}
      {requestBusy && !info && !error && (
        <p className="mt-2 text-sm text-chess-muted">코드를 보내는 중...</p>
      )}
      {info && <p className="mt-3 text-sm text-green-400">{info}</p>}
      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="block text-sm font-medium text-chess-primary">인증 코드 (6자리)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 font-mono text-sm tracking-widest"
            placeholder="000000"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "확인 중..." : "인증하기"}
          </button>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={requestBusy}
            className="rounded-md border border-chess-border px-4 py-2 text-sm text-chess-primary disabled:opacity-50"
          >
            코드 다시 받기
          </button>
        </div>
      </form>
    </section>
  );
}
