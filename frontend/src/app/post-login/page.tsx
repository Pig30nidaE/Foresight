"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { useTranslation } from "@/shared/lib/i18n";

export default function PostLoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const { t } = useTranslation();
  const [message, setMessage] = useState(t("postLogin.checking"));

  useEffect(() => {
    const run = async () => {
      if (status === "loading") return;
      if (status === "unauthenticated") {
        router.replace("/");
        return;
      }
      try {
        const token = await getBackendJwt();
        if (!token) {
          router.replace("/");
          return;
        }
        const me = await api.get("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (me.data?.signup_completed) {
          router.replace("/");
          return;
        }
        setMessage(t("postLogin.needConsent"));
        router.replace("/signup/consent");
      } catch {
        setMessage(t("postLogin.failed"));
      }
    };
    void run();
  }, [router, status, t]);

  return (
    <section className="mx-auto w-full max-w-lg rounded-xl border border-chess-border bg-chess-surface/70 p-6">
      <h1 className="text-xl font-bold text-chess-primary">{t("postLogin.title")}</h1>
      <p className="mt-3 text-sm text-chess-muted">{message}</p>
    </section>
  );
}
