import axios from "axios";
import type {
  PlayerProfile,
  GameSummary,
  PerformanceSummary,
  OpponentAnalysis,
  Platform,
  TimeClass,
  FirstMoveEntry,
  OpeningTreeNode,
  BestWorstOpenings,
  TimePressureStats,
  MoveQualityStats,
  TacticalAnalysis,
} from "@/types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
  timeout: 30000,
});

// ────────────────────────────────────────────
// Player
// ────────────────────────────────────────────
export const getPlayerProfile = async (
  platform: Platform,
  username: string
): Promise<PlayerProfile> => {
  const { data } = await api.get(`/player/${platform}/${username}`);
  return data;
};

// ────────────────────────────────────────────
// Games
// ────────────────────────────────────────────
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

// ────────────────────────────────────────────
// Analysis
// ────────────────────────────────────────────
export const getPerformanceSummary = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  maxGames = 100
): Promise<PerformanceSummary> => {
  const { data } = await api.get(`/analysis/performance/${platform}/${username}`, {
    params: { time_class: timeClass, max_games: maxGames },
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

export const getOpponentAnalysis = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz"
): Promise<OpponentAnalysis> => {
  const { data } = await api.get(`/analysis/opponent/${platform}/${username}`, {
    params: { time_class: timeClass },
    timeout: 120_000, // Stockfish + LightGBM 분석은 최대 ~60s — 여유있게 2분
  });
  return data;
};

// ────────────────────────────────────────────
// Stats (MVP 섹션 1, 2)
// ────────────────────────────────────────────
export const getFirstMoveStats = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
) => {
  const params: Record<string, unknown> = { time_class: timeClass };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/first-moves/${platform}/${username}`, { params });
  return data as { white: FirstMoveEntry[]; black: FirstMoveEntry[] };
};

export const getOpeningTree = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
  side?: "white" | "black",
) => {
  const params: Record<string, unknown> = { time_class: timeClass };
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
) => {
  const params: Record<string, unknown> = { time_class: timeClass };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/opening-best-worst/${platform}/${username}`, { params });
  return data as BestWorstOpenings;
};

export const getTimePressure = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  maxGames = 100,
  sinceMs?: number,
  untilMs?: number,
): Promise<TimePressureStats> => {
  const params: Record<string, unknown> = { time_class: timeClass, max_games: maxGames };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/time-pressure/${platform}/${username}`, { params });
  return data as TimePressureStats;
};

// ────────────────────────────────────────────
// Engine (Step 6: 수 품질 분석)
// ────────────────────────────────────────────
export const getMoveQuality = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "bullet",
  maxGames = 5,
): Promise<MoveQualityStats> => {
  const { data } = await api.get(`/engine/move-quality/${platform}/${username}`, {
    params: { time_class: timeClass, max_games: maxGames },
    timeout: 300_000,   // Stockfish 분석 최대 5분
  });
  return data as MoveQualityStats;
};

export const getTacticalPatterns = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  sinceMs?: number,
  untilMs?: number,
): Promise<TacticalAnalysis> => {
  const params: Record<string, unknown> = { time_class: timeClass };
  if (sinceMs) params.since_ms = sinceMs;
  if (untilMs) params.until_ms = untilMs;
  const { data } = await api.get(`/stats/tactical-patterns/${platform}/${username}`, { params });
  return data as TacticalAnalysis;
};

export default api;
