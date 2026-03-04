// ============================================================
// Dashboard 기능 전용 타입 — Dev1 담당 영역
// ============================================================

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
  is_success?: boolean;          // 패턴별 성공 여부 (패턴마다 기준이 다름)
  metric_value?: number | null;  // 패턴 핵심 수치 (잔여초, CP손실, 비율 등)
  metric_label?: string | null;  // 수치 레이블 (예: "최저 잔여시간")
  context?: string | null;       // 해당 게임에서 일어난 일 1줄 요약
  opening_eco?: string | null;
  opening_name?: string | null;
  played_at?: string | null;
  white?: string | null;
  black?: string | null;
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
// ML 전술 패턴 분석
// ────────────────────────────────────────────
export interface TacticalPattern {
  label: string;
  description: string;
  icon: string;
  score: number;
  is_strength: boolean;
  games_analyzed: number;
  detail: string;
  category: "time" | "position" | "opening" | "endgame" | "balance";
  example_game?: {
    url: string;
    result: "win" | "loss" | "draw";
    opening_eco?: string | null;
    opening_name?: string | null;
    played_at?: string | null;
    hint?: string | null;
  } | null;
  top_games?: PatternGameItem[];
  situation_id?: number;
  insight?: string;
  key_metric_value?: number | null;
  key_metric_label?: string;
  key_metric_unit?: string;
  evidence_count?: number;
  /** streak 깊이별 수 품질 추이 (상황 5 틸트 전용) */
  chart_data?: {
    normal_avg:   number;
    win_trend:    Array<{ depth: string; avg_q: number }>;
    loss_trend:   Array<{ depth: string; avg_q: number }>;
    win_count:    number;
    loss_count:   number;
    normal_count: number;
  } | null;
}

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

export interface XGBoostProfile {
  blunder_game_rate: number;
  top_risk_factors: XGBoostRiskFactor[];
  feature_importances: { feature: string; importance: number }[];
  model_accuracy: number;
  games_analyzed: number;
  description: string;
}

export interface AiInsights {
  strengths_summary: string;
  weaknesses_summary: string;
  best_situation: string;
  worst_situation: string;
  recommendations: string[];
  training_focus: string;
  generated_by: "gpt-4o-mini" | "rule-based";
}

export interface AiInsightsResponse {
  username: string;
  platform: string;
  total_games: number;
  insights: AiInsights;
}

export interface TacticalAnalysis {
  total_games: number;
  patterns: TacticalPattern[];
  strengths: TacticalPattern[];
  weaknesses: TacticalPattern[];
  cluster_analysis: ClusterAnalysis | null;
  xgboost_profile: XGBoostProfile | null;
}
