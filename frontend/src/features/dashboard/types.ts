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
  is_success?: boolean;          // 패턴별 성공 여부 (패턴마다 기준이 다름)
  sac_tier?: 1 | 2 | 3 | 4 | 5;
  advantage_outcome?: "smooth" | "shaky" | "blown";
  metric_value?: number | null;  // 패턴 핵심 수치 (잔여초, CP손실, 비율 등)
  metric_label?: string | null;  // 수치 레이블 (예: "최저 잔여시간")
  context?: string | null;       // 해당 게임에서 일어난 일 1줄 요약
  opening_eco?: string | null;
  opening_name?: string | null;
  played_at?: string | null;
  white?: string | null;
  black?: string | null;
  // 희생 패턴 전용 필드 (situation_id=3)
  pgn?: string | null;
  sacrifice_move_no?: number | null;
  sacrifice_color?: "white" | "black" | null;
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
  insufficient_data?: boolean;
  /** 패턴별 차트/분석 데이터 */
  chart_data?: {
    /** 우위 유지력 (situation_id=4) — 유지/역전 파트 분석 */
    type:          "advantage_breakdown";
    scan_pool?:    number;
    scan_cap?:     number;
    total:         number;
    maintained?:   number;
    reversed_mid?: number;
    reversed_end?: number;
    // 확장 집계 필드 (백엔드 최신 포맷)
    smooth?:       number;
    shaky?:        number;
    blown?:        number;
    converted?:    number;
    conv_rate?:    number;
    smooth_rate?:  number;
    neg_avg_move?: number | null;
    mid_avg_move:  number | null;
    end_avg_move:  number | null;
    maintain_rate?: number;
  } | {
    /** 반대/같은방향 캐슬링 비교 (situation_id=7) */
    type: "castling_comparison";
    opposite_games: Array<{
      url: string | null;
      result: string;
      is_success: boolean;
      opening_name: string | null;
      opening_eco: string | null;
      played_at: string | null;
      white: string;
      black: string;
    }>;
    same_games: Array<{
      url: string | null;
      result: string;
      is_success: boolean;
      opening_name: string | null;
      opening_eco: string | null;
      played_at: string | null;
      white: string;
      black: string;
    }>;
  } | {
    /** 희생 5등급 분포 (situation_id=3) */
    type: "sacrifice_tiers";
    total: number;
    t1: number;
    t2: number;
    t3: number;
    t4: number;
    t5: number;
    declined?: number;
    unnecessary?: number;
    avg_score: number;
  } | {
    /** 주력/생소 오프닝 비교 (situation_id=18) */
    type: "opening_comparison";
    main_games: Array<{
      url: string | null;
      result: string;
      is_success: boolean;
      opening_name: string | null;
      opening_eco: string | null;
      played_at: string | null;
      white: string;
      black: string;
    }>;
    unfamiliar_games: Array<{
      url: string | null;
      result: string;
      is_success: boolean;
      opening_name: string | null;
      opening_eco: string | null;
      played_at: string | null;
      white: string;
      black: string;
    }>;
    main_rate: number;
    unfamiliar_rate: number;
    diff: number;
    main_count: number;
    unfamiliar_count: number;
  } | {
    /** IQP 구조 비교 (situation_id=10) */
    type: "iqp_comparison";
    my_iqp_games: Array<{
      url: string | null;
      result: string;
      is_success: boolean;
      opening_name: string | null;
      opening_eco: string | null;
      played_at: string | null;
      white: string;
      black: string;
      iqp_side: "my" | "opp" | "none";
      quality_score: number;
    }>;
    opp_iqp_games: Array<{
      url: string | null;
      result: string;
      is_success: boolean;
      opening_name: string | null;
      opening_eco: string | null;
      played_at: string | null;
      white: string;
      black: string;
      iqp_side: "my" | "opp" | "none";
      quality_score: number;
    }>;
    none_iqp_games: Array<{
      url: string | null;
      result: string;
      is_success: boolean;
      opening_name: string | null;
      opening_eco: string | null;
      played_at: string | null;
      white: string;
      black: string;
      iqp_side: "my" | "opp" | "none";
      quality_score: number;
    }>;
    my_iqp_rate: number;
    opp_iqp_rate: number;
    none_iqp_rate: number;
    my_iqp_count: number;
    opp_iqp_count: number;
    none_iqp_count: number;
    my_vs_none_diff: number;
    my_vs_opp_diff: number;
    my_quality_avg: number;
    opp_quality_avg: number;
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
  precision?: number;
  recall?: number;
  f1?: number;
  baseline_accuracy?: number;
  lift_over_baseline?: number;
  positive_rate?: number;
  validation_support?: { positive: number; negative: number };
  is_meaningful?: boolean;
  quality_note?: string;
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

export interface TacticalProgressStatus {
  job_id: string | null;
  status: "idle" | "queued" | "running" | "completed" | "failed";
  progress_percent: number;
  stage: string;
  message: string;
  total_games: number;
  analyzed_games: number;
  error?: string | null;
}
