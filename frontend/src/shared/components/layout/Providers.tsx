"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { SettingsProvider } from "../settings/SettingsContext";
import { setApiRuntimeBaseUrl } from "@/shared/lib/api";

export default function Providers({
  children,
  apiBaseUrl,
}: {
  children: React.ReactNode;
  /** 서버(layout)에서 읽은 API 베이스 — 클라이언트 번들의 localhost fallback 을 덮어씀 */
  apiBaseUrl: string;
}) {
  if (typeof window !== "undefined") {
    setApiRuntimeBaseUrl(apiBaseUrl);
  }

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1분
            gcTime: 30 * 60 * 1000, // 30분간 비활성 캐시 유지 (탭 전환 시 데이터 보존)
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>{children}</SettingsProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
