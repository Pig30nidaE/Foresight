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
  recent_form: string[];  // 최근 게임 결과 (최신순): ["win","loss","draw",...]
}

export interface RatingDataPoint {
  date: number;    // Unix timestamp (seconds)
  rating: number;
}

export interface OpponentEcoGroupStats {
  eco_group: string;
  eco_group_name: string;
  games: number;
  win_rate: number;
  avg_opening_cp_loss: number | null;
  top_opening: string;
}

export interface OpponentOpeningProfile {
  white_tree: OpponentEcoGroupStats[];
  black_tree: OpponentEcoGroupStats[];
  weakest_as_white: string | null;
  weakest_as_black: string | null;
}

export interface OpponentPhaseData {
  avg_cp_loss: number | null;
  score: number | null;
  n: number;
  label: string;
}

export interface OpponentPhaseWeakness {
  opening?: OpponentPhaseData;
  middlegame?: OpponentPhaseData;
  endgame?: OpponentPhaseData;
  weakest_phase: string | null;
}

export interface OpponentStyleProfile {
  tactical_score: number;
  time_management_score: number;
  complexity_preference: string;
  game_length_tendency: string;
  clock_pressure_threshold: number;
  opening_preparation_score: number;
  queen_exchange_rate: number;
  opposite_castling_rate: number;
}

export interface LGBMBlunderTrigger {
  feature: string;
  impact: number;
  description: string;
}

export interface LGBMInsights {
  available: boolean;
  reason?: string;
  blunder_triggers?: LGBMBlunderTrigger[];
  phase_top_triggers?: Record<string, { top_trigger: string | null }>;
  cv_mae?: number | null;
  games_used?: number;
}

export interface StyleCluster {
  id: number;
  n_games: number;
  win_rate: number;
  avg_cp_loss: number | null;
  label: string;
  is_weakness: boolean;
}

export interface StyleClusters {
  clusters: StyleCluster[];
  worst_cluster: string | null;
  n_clusters: number;
}

export interface PrepAdvice {
  priority: number;
  category: string;
  title: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
}

export interface OpponentAnalysis {
  total_games: number;
  win_rate: number;
  summary: {
    style_tag: string;
    key_insight: string;
    games_analyzed: number;
    sf_games_analyzed: number;
  };
  opening_profile: OpponentOpeningProfile;
  phase_weakness: OpponentPhaseWeakness;
  style_profile: OpponentStyleProfile;
  ml_insights: {
    lgbm: LGBMInsights;
    style_clusters: StyleClusters | null;
  };
  preparation_advice: PrepAdvice[];
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

// K-Means 군집화 결과
export interface ClusterInfo {
  id: number;
  n_games: number;
  win_rate: number;
  label: string;
  description: string;
  key_traits: string[];
  is_weakness: boolean;
  is_strength: boolean;
  center: Record<string, number>;
}

export interface ClusterAnalysis {
  n_clusters: number;
  feature_names: string[];
  clusters: ClusterInfo[];
  overall_win_rate: number;
  summary: string;
  top_weakness: string | null;
  top_strength: string | null;
}

export interface XGBoostRiskFactor {
  feature: string;
  importance: number;
  description: string;
}

export interface XGBoostFeatureImportance {
  feature: string;
  importance: number;
}

export interface XGBoostProfile {
  blunder_game_rate: number;
  top_risk_factors: XGBoostRiskFactor[];
  feature_importances: XGBoostFeatureImportance[];
  model_accuracy: number;
  games_analyzed: number;
  description: string;
}

export interface TacticalAnalysis {
  total_games: number;
  patterns: TacticalPattern[];
  strengths: TacticalPattern[];
  weaknesses: TacticalPattern[];
  cluster_analysis: ClusterAnalysis | null;
  xgboost_profile: XGBoostProfile | null;
}

