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
  });
  return data;
};

// ────────────────────────────────────────────
// Stats (MVP 섹션 1, 2)
// ────────────────────────────────────────────
export const getFirstMoveStats = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz"
) => {
  const { data } = await api.get(`/stats/first-moves/${platform}/${username}`, {
    params: { time_class: timeClass },
  });
  return data as { white: FirstMoveEntry[]; black: FirstMoveEntry[] };
};

export const getOpeningTree = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz"
) => {
  const { data } = await api.get(`/stats/opening-tree/${platform}/${username}`, {
    params: { time_class: timeClass },
  });
  return data as OpeningTreeNode[];
};

export const getBestWorstOpenings = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz"
) => {
  const { data } = await api.get(`/stats/opening-best-worst/${platform}/${username}`, {
    params: { time_class: timeClass },
  });
  return data as BestWorstOpenings;
};

export const getTimePressure = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  maxGames = 100
): Promise<TimePressureStats> => {
  const { data } = await api.get(`/stats/time-pressure/${platform}/${username}`, {
    params: { time_class: timeClass, max_games: maxGames },
  });
  return data as TimePressureStats;
};

export default api;
