/**
 * Dashboard 기능 API — Dev1 담당 영역
 * ────────────────────────────────────
 * 새 대시보드 API 함수는 이 파일에 추가하세요.
 */
import api from "@/shared/lib/api";
import type { Platform, TimeClass } from "@/shared/types";
import type {
  FirstMoveEntry,
  OpeningTreeNode,
  BestWorstOpenings,
  TimePressureStats,
  TacticalAnalysis,
  TacticalProgressStatus,
  AiInsightsResponse,
  MoveQualityStats,
  GameSummaryItem,
} from "./types";

// ────────────────────────────────────────────
// First Moves
// ────────────────────────────────────────────
export const getFirstMoveStats = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  maxGames = 300,
) => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/first-moves/${platform}/${username}`, { params });
  return data as { white: FirstMoveEntry[]; black: FirstMoveEntry[]; total_games: number };
};

// ────────────────────────────────────────────
// Opening Tree
// ────────────────────────────────────────────
export const getOpeningTree = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  side?: "white" | "black",
  maxGames = 300,
) => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  if (side) params.side = side;
  const { data } = await api.get(`/stats/opening-tree/${platform}/${username}`, { params });
  return data as OpeningTreeNode[];
};

export const getBestWorstOpenings = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  maxGames = 300,
) => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/opening-best-worst/${platform}/${username}`, { params });
  return data as BestWorstOpenings;
};

// ────────────────────────────────────────────
// Time Pressure
// ────────────────────────────────────────────
export const getTimePressure = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  maxGames = 300,
): Promise<TimePressureStats> => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/time-pressure/${platform}/${username}`, { params });
  return data as TimePressureStats;
};

// ────────────────────────────────────────────
// Tactical Patterns
// ────────────────────────────────────────────
export const getTacticalPatterns = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  maxGames = 300,
): Promise<TacticalAnalysis> => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  // 전술 분석은 Stockfish 정밀 분석이 포함되어 수분 단위 소요될 수 있음
  const { data } = await api.get(`/stats/tactical-patterns/${platform}/${username}`, { params, timeout: 900000 });
  return data as TacticalAnalysis;
};

export const getTacticalProgress = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  maxGames = 300,
): Promise<TacticalProgressStatus> => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/tactical-patterns/${platform}/${username}/progress`, { params });
  return data as TacticalProgressStatus;
};

export const getAiInsights = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  maxGames = 300,
): Promise<AiInsightsResponse> => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(
    `/stats/tactical-patterns/${platform}/${username}/ai-insights`,
    { params, timeout: 60_000 },
  );
  return data as AiInsightsResponse;
};

// ────────────────────────────────────────────
// Move Quality (Engine)
// ────────────────────────────────────────────
export const getMoveQuality = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "bullet",
  maxGames = 5,
): Promise<MoveQualityStats> => {
  const { data } = await api.get(`/engine/move-quality/${platform}/${username}`, {
    params: { time_class: timeClass, max_games: maxGames },
    timeout: 300_000,
  });
  return data as MoveQualityStats;
};

// ────────────────────────────────────────────
// 전적 조회
// ────────────────────────────────────────────
export const getRecentGamesList = async (
  platform: Platform,
  username: string,
  timeClass?: TimeClass,
  maxGames = 50,
  sinceMs?: number,
  untilMs?: number,
): Promise<GameSummaryItem[]> => {
  const params: Record<string, unknown> = { max_games: maxGames };
  if (timeClass) params.time_class = timeClass;
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/games/${platform}/${username}`, { params });
  return data as GameSummaryItem[];
};
