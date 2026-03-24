"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect } from "react";

import api from "@/shared/lib/api";
import { clearBackendJwtCache, getBackendJwt } from "@/shared/lib/backendJwt";
import { useTranslation } from "@/shared/lib/i18n";

type MeSignup = {
  signup_completed?: boolean;
  email_conflict?: boolean;
};

export default function SignupConsentPage() {
  const router = useRouter();
  const { status } = useSession();
  const { t } = useTranslation();

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
        const { data } = await api.get("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data?.signup_completed) {
          router.replace("/");
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
      <h1 className="text-xl font-bold text-chess-primary">{t("signupConsent.title")}</h1>
      <p className="mt-3 text-sm text-chess-muted">
        {t("signupConsent.desc")}
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
              const { data } = await api.get<MeSignup>("/me", {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (data?.signup_completed) {
                router.replace("/");
                return;
              }
              router.push("/signup");
            } catch {
              router.push("/signup");
            }
          }}
          className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {t("signupConsent.accept")}
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-md border border-chess-border px-4 py-2 text-sm text-chess-primary"
        >
          {t("signupConsent.reject")}
        </button>
      </div>
    </section>
  );
}
