"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";

export default function PostLoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [message, setMessage] = useState("로그인 상태를 확인하는 중...");

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
        const me = await api.get("/forum/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (me.data?.signup_completed) {
          router.replace("/forum");
          return;
        }
        setMessage("회원가입 동의가 필요합니다.");
        router.replace("/signup/consent");
      } catch {
        setMessage("계정을 확인하지 못했습니다. 잠시 후 다시 시도하거나 홈으로 이동해 주세요.");
      }
    };
    void run();
  }, [router, status]);

  return (
    <section className="mx-auto w-full max-w-lg rounded-xl border border-chess-border bg-chess-surface/70 p-6">
      <h1 className="text-xl font-bold text-chess-primary">로그인 처리</h1>
      <p className="mt-3 text-sm text-chess-muted">{message}</p>
    </section>
  );
}
