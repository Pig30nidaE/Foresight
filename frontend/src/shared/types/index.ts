// ============================================================
// 공용 타입 — 전 기능에서 공유
// ============================================================
export type Platform = "chess.com" | "lichess";
export type TimeClass = "bullet" | "blitz" | "rapid" | "classical";
export type GameResult = "win" | "loss" | "draw";

export interface PlayerProfile {
  username: string;
  platform: Platform;
  rating_rapid?: number;
  rating_blitz?: number;
  rating_bullet?: number;
  country?: string;
  avatar_url?: string;
  joined?: string;
  games_bullet?: number;
  games_blitz?: number;
  games_rapid?: number;
  games_classical?: number;
  rating_classical?: number;
  preferred_time_class?: string;
}

export interface GameSummary {
  game_id: string;
  platform: Platform;
  white: string;
  black: string;
  result: GameResult;
  time_class: TimeClass;
  opening_eco?: string;
  opening_name?: string;
  pgn?: string;
  played_at?: string;
  url?: string;
}

export interface OpeningStats {
  eco: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface PerformanceSummary {
  username: string;
  platform: Platform;
  time_class: TimeClass;
  total_games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  top_openings: OpeningStats[];
}
