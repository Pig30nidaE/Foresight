/**
 * 공용 Axios 인스턴스 + 공유 API 함수
 * 새 기능의 API 함수는 features/<feature>/api.ts 에 추가
 *
 * 프로덕션 URL은 `app/layout.tsx` → `Providers` 가 서버에서 읽은 값으로
 * `setApiRuntimeBaseUrl` 을 호출해 덮어씁니다 (클라이언트 번들에 NEXT_PUBLIC 미주입 대비).
 */
import axios, { type InternalAxiosRequestConfig } from "axios";
import type { Platform, TimeClass, PlayerProfile, GameSummary, PerformanceSummary } from "@/shared/types";
import type { AnalysisSSEEvent } from "@/shared/types";
import { resolveApiBaseUrl } from "@/shared/lib/apiBaseUrl";
import { clearBackendJwtCache, getBackendJwt } from "@/shared/lib/backendJwt";

/** 서버가 내려준 베이스 URL (클라이언트에서 Providers가 설정) */
let runtimeApiBaseUrl: string | null = null;

export function setApiRuntimeBaseUrl(url: string): void {
  const u = url.replace(/\/+$/, "");
  runtimeApiBaseUrl = u;
  api.defaults.baseURL = u;
}

function effectiveApiBaseUrl(): string {
  return runtimeApiBaseUrl ?? resolveApiBaseUrl();
}

const api = axios.create({
  baseURL: effectiveApiBaseUrl(),
  timeout: 30000,
});

type RetryConfig = InternalAxiosRequestConfig & { __jwtRetried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const ax = error as {
      config?: RetryConfig;
      response?: { status?: number };
    };
    const original = ax.config;
    if (!original || original.__jwtRetried) {
      return Promise.reject(error);
    }
    if (ax.response?.status !== 401) {
      return Promise.reject(error);
    }
    const authHeader = original.headers?.Authorization;
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      return Promise.reject(error);
    }
    original.__jwtRetried = true;
    clearBackendJwtCache();
    const token = await getBackendJwt();
    if (!token) {
      return Promise.reject(error);
    }
    if (original.headers && typeof original.headers.set === "function") {
      original.headers.set("Authorization", `Bearer ${token}`);
    } else {
      (original.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
    return api.request(original);
  }
);

export default api;

export const getPlayerProfile = async (
  platform: Platform,
  username: string
): Promise<PlayerProfile> => {
  const { data } = await api.get(`/player/${platform}/${username}`);
  return data;
};

export const getRecentGames = async (
  platform: Platform,
  username: string,
  maxGames = 50,
  timeClass?: TimeClass
): Promise<GameSummary[]> => {
  const params: Record<string, unknown> = { max_games: maxGames };
  if (timeClass) params.time_class = timeClass;
  const { data } = await api.get(`/games/${platform}/${username}`, { params });
  return data;
};

export const getPerformanceSummary = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz"
): Promise<PerformanceSummary> => {
  const { data } = await api.get(`/analysis/performance/${platform}/${username}`, {
    params: { time_class: timeClass },
  });
  return data;
};

export const getOpeningStats = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  topN = 10
) => {
  const { data } = await api.get(`/analysis/openings/${platform}/${username}`, {
    params: { time_class: timeClass, top_n: topN },
  });
  return data;
};

/**
 * SSE 스트리밍 게임 분석.
 * fetch + ReadableStream으로 SSE 이벤트를 AsyncGenerator로 yield합니다.
 */
export async function* streamGameAnalysis(
  pgn: string,
  gameId: string,
  stockfishDepth?: number,
  signal?: AbortSignal,
): AsyncGenerator<AnalysisSSEEvent> {
  const res = await fetch(`${effectiveApiBaseUrl()}/game-analysis/game/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pgn,
      game_id: gameId,
      stockfish_depth: stockfishDepth,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    yield { type: "error" as const, message: text };
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop()!;

      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line || line.startsWith(":")) continue;
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as AnalysisSSEEvent;
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
