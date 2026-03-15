// ============================================================
// Dashboard 기능 전용 타입 — Dev1 담당 영역
// ============================================================

// ────────────────────────────────────────────
// 전적 조회
// ────────────────────────────────────────────
export interface GameSummaryItem {
  game_id: string;
  platform: "chess.com" | "lichess";
  white: string;
  black: string;
  result: "win" | "loss" | "draw";
  time_class: string;
  opening_eco: string | null;
  opening_name: string | null;
  pgn: string | null;
  played_at: string | null;
  url: string | null;
  rating_white: number | null;
  rating_black: number | null;
  cp_evals: (number | null)[] | null;
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

export interface PatternGameItem {
  url: string;
  result: "win" | "loss" | "draw";
}

export interface OpeningTreeNode {
  eco_prefix: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  top_games?: PatternGameItem[];
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
// 수 품질 분석 (Section 3-B)
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
  accuracy: number;
  acpl: number;
  categories: MoveQualityCategory[];
}

// ────────────────────────────────────────────
// 시간 압박 분석 (Section 3-A)
// ────────────────────────────────────────────
export interface TimePressurePhase {
  phase: "opening" | "middlegame" | "endgame";
  moves: number;
  pressure_moves: number;
  pressure_ratio: number;
  avg_time_spent: number | null;
}

export interface TimePressurePerMove {
  move_number: number;
  games: number;
  pressure_pct: number;
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
// 전술 패턴 분석 (Tactical Analysis)
// ────────────────────────────────────────────
export interface TacticalPatternDetail {
  pattern_id: string;
  name: string;
  description: string;
  score: number;
  is_strength: boolean;
  games_analyzed: number;
  detail: string;
  category: string;
  situation_id: number;
  insight: string;
  key_metric_value: number;
  key_metric_label: string;
  key_metric_unit: string;
  evidence_count: number;
  representative_games: Array<{
    game_id: string;
    url: string | null;
    white: string;
    black: string;
    result: string;
    accuracy: number | null;
    played_at: string | null;
  }>;
  chart_data?: {
    type: string;
    opposite_games?: any[];
    same_games?: any[];
    main_games?: any[];
    unfamiliar_games?: any[];
    my_iqp_games?: any[];
    opp_iqp_games?: any[];
    none_iqp_games?: any[];
  };
}

export interface TacticalPatternsResponse {
  patterns: TacticalPatternDetail[];
  analyzed_games: number;
  total_games: number;
  is_cache: boolean;
}

export interface TacticalProgressResponse {
  total: number;
  analyzed: number;
  ready: boolean;
  status: string;
}
