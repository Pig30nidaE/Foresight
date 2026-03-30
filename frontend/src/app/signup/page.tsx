"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { TermsModal } from "@/shared/components/signup/TermsModal";
import api from "@/shared/lib/api";
import { apiErrorDetail } from "@/shared/lib/apiErrorDetail";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { useTranslation } from "@/shared/lib/i18n";

type MeSignup = {
  signup_completed?: boolean;
  email_conflict?: boolean;
  masked_conflict_email?: string | null;
};

export default function SignupPage() {
  const router = useRouter();
  const { status } = useSession();
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [meInfo, setMeInfo] = useState<MeSignup | null>(null);

  const normalizeDisplayName = (raw: string) => raw.replace(/\s+/g, " ").trim();
  const isValidDisplayName = (name: string) => /^[\p{L}\p{N}_][\p{L}\p{N} ._-]{1,49}$/u.test(name);

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
        const { data } = await api.get<MeSignup>("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMeInfo(data ?? null);
        if (data?.signup_completed) {
          router.replace("/");
          return;
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
      const normalizedName = normalizeDisplayName(displayName);
      if (!isValidDisplayName(normalizedName)) {
        throw new Error(t("signup.error.nicknameRule"));
      }
      const token = await getBackendJwt();
      if (!token) {
        throw new Error(t("signup.error.noToken"));
      }
      await api.post(
        "/forum/signup",
        { display_name: normalizedName, agree_terms: agree },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      router.replace("/");
    } catch (err: unknown) {
      setError(apiErrorDetail(err));
    } finally {
      setBusy(false);
    }
  };

  const conflict = Boolean(meInfo?.email_conflict);
  const conflictMsg = meInfo?.masked_conflict_email
    ? t("signup.conflict.masked").replace("{email}", meInfo.masked_conflict_email)
    : t("signup.conflict.default");

  return (
    <section className="mx-auto w-full max-w-lg pixel-frame bg-chess-surface/75 p-6">
      <h1 className="text-xl font-bold text-chess-primary">{t("signup.title")}</h1>
      <p className="mt-2 text-sm text-chess-muted">
        {t("signup.desc")}
      </p>
      {conflict && (
        <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-200">
          {conflictMsg}
        </p>
      )}
      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="block text-sm font-medium text-chess-primary">{t("signup.nickname")}</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={50}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="username"
            spellCheck={false}
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
            {t("signup.terms.view")}
          </button>
          <label className="flex items-center gap-2 text-sm text-chess-primary">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              disabled={conflict}
            />
            {t("signup.terms.agree")}
          </label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || !agree || conflict}
          className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("signup.submit.busy") : t("signup.submit.done")}
        </button>
      </form>
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </section>
  );
}
