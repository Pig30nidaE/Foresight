/**
 * 공용 Axios 인스턴스 + 공유 API 함수
 * 새 기능의 API 함수는 features/<feature>/api.ts 에 추가
 */
import axios from "axios";
import type { Platform, TimeClass, PlayerProfile, GameSummary, PerformanceSummary } from "@/shared/types";
import type { AnalysisSSEEvent } from "@/shared/types";

/**
 * 백엔드 API 베이스 (끝에 슬래시 없이 `/api/v1`).
 * Vercel 등: 반드시 **빌드 시점**에 주입됨 → env 추가/변경 후 Redeploy 필요.
 * 키 이름은 `NEXT_PUBLIC_API_URL` 권장. (구호환: `NEXT_PUBLIC_API`)
 */
const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API ||
  "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: PUBLIC_API_BASE_URL,
  timeout: 30000,
});

export default api;

const SSE_BASE_URL = PUBLIC_API_BASE_URL;

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
  const res = await fetch(`${SSE_BASE_URL}/game-analysis/game/stream`, {
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
