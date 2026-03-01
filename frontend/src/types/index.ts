// ============================================================
// Foresight 공용 타입 정의
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

export interface OpponentAnalysis {
  username: string;
  platform: Platform;
  total_games_analyzed: number;
  win_rate: number;
  loss_rate: number;
  frequent_openings: OpeningStats[];
  result_trend: Array<{
    played_at: string;
    win: number;
    loss: number;
    draw: number;
  }>;
}

// ────────────────────────────────────────────
// Stats (MVP 섹션 1, 2)
// ────────────────────────────────────────────
export interface FirstMoveEntry {
  eco: string;
  first_move_category: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface OpeningTreeNode {
  eco_prefix: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  children?: OpeningTreeNode[];
}

export interface BestWorstOpenings {
  best: { eco: string; name: string; win_rate: number; games: number } | null;
  worst: { eco: string; name: string; win_rate: number; games: number } | null;
  all: Array<{
    eco: string;
    name: string;
    games: number;
    win_rate: number;
    wins: number;
    losses: number;
    draws: number;
  }>;
}

// ────────────────────────────────────────────
// Step 6: 수 품질 분석 (Section 3-B)
// ────────────────────────────────────────────
export interface MoveQualityCategory {
  category: string;
  emoji: string;
  color: string;
  count: number;
  percentage: number;
}

export interface MoveQualityStats {
  username: string;
  platform: string;
  time_class: string;
  games_analyzed: number;
  total_moves: number;
  accuracy: number;       // 0~100 (Chess.com 방식)
  acpl: number;           // 평균 센티폰 손실
  categories: MoveQualityCategory[];
}

// ────────────────────────────────────────────
// Step 5: 시간 압박 분석 (Section 3-A)
// ────────────────────────────────────────────
export interface TimePressurePhase {
  phase: "opening" | "middlegame" | "endgame";
  moves: number;
  pressure_moves: number;
  pressure_ratio: number;   // 0~1
  avg_time_spent: number | null;
}

export interface TimePressurePerMove {
  move_number: number;
  games: number;
  pressure_pct: number;     // 0~100
  avg_time_spent: number | null;
}

export interface TimePressureStats {
  total_games: number;
  games_with_clock: number;
  overall: Record<string, {
    total_moves: number;
    pressure_moves: number;
    pressure_ratio: number;
    avg_time_spent: number | null;
  }>;
  by_phase: TimePressurePhase[];
  per_move: TimePressurePerMove[];
}

// ────────────────────────────────────────────
// MVP.md 기반 ML 전술 패턴 분석
// ────────────────────────────────────────────
export interface TacticalPattern {
  label: string;
  description: string;
  icon: string;
  score: number;         // 0–100
  is_strength: boolean;
  games_analyzed: number;
  detail: string;
  category: "time" | "position" | "opening" | "endgame" | "balance";
}

export interface TacticalAnalysis {
  total_games: number;
  patterns: TacticalPattern[];
  strengths: TacticalPattern[];
  weaknesses: TacticalPattern[];
}
