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
  opening_name?: string | null;
  played_at?: string | null;
  white?: string | null;
  black?: string | null;
  context?: string | null;
  is_success?: boolean | null;
  // advantage breakdown용(핀/희생 등) 상태
  advantage_outcome?: "smooth" | "shaky" | "blown" | null;
  metric_value?: number | null;
  metric_label?: string | null;

  // 서버 스키마가 확장될 수 있으므로 UI에서 알 수 없는 필드는 허용
  [key: string]: any;
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

/** Lichess 분석(judgment)이 붙은 '시간 압박' 수에 대한 요약 */
export interface UnderPressureQuality {
  pressure_moves: number;
  judged_moves: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  severe_under_pressure_ratio: number;
  blunder_under_pressure_ratio: number;
}

export interface TimePressureOverallBlock {
  total_moves: number;
  pressure_moves: number;
  pressure_ratio: number;
  avg_time_spent: number | null;
  under_pressure_quality?: UnderPressureQuality;
}

export interface TimePressureStats {
  total_games: number;
  games_with_clock: number;
  overall: Record<string, TimePressureOverallBlock>;
  by_phase: TimePressurePhase[];
  per_move: TimePressurePerMove[];
  pressure_threshold_seconds?: number;
  pressure_threshold_mode?: string;
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

// ────────────────────────────────────────────
// 전술 패턴 UI 전용 타입 (TacticalPatternsCard)
// ────────────────────────────────────────────
export interface ClusterInfo {
  id?: string | number;
  label: string;
  description: string;
  win_rate: number;
  n_games: number;
  key_traits: string[];
  is_strength?: boolean;
  is_weakness?: boolean;
  [key: string]: any;
}

export interface AiInsights {
  generated_by: string;
  best_situation: string;
  worst_situation: string;
  strengths_summary: string;
  weaknesses_summary: string;
  recommendations: string[];
  training_focus: string;
  [key: string]: any;
}

export interface XGBoostRiskFactor {
  feature: string;
  description?: string | null;
  importance?: number | null;
  [key: string]: any;
}

export interface XGBoostProfile {
  blunder_game_rate: number;
  is_meaningful?: boolean;
  games_analyzed: number;
  lift_over_baseline?: number | null;
  top_risk_factors: XGBoostRiskFactor[];

  // 기술 지표(있을 수도/없을 수도)
  precision?: number | null;
  recall?: number | null;
  f1?: number | null;
  quality_note?: string | null;

  validation_support?: {
    positive: number | null;
    negative: number | null;
  } | null;

  // 서버 확장 대비
  [key: string]: any;
}

export type TacticalChartData = {
  type: string;
  [key: string]: any;
};

export interface TacticalPattern {
  // 카드/리스트 공통 필드
  label: string;
  icon: string;
  situation_id?: number | null;
  category: string;
  score: number;

  // 수치/설명(선택)
  key_metric_value?: number | null;
  key_metric_unit?: string;
  key_metric_label?: string;
  insight?: string | null;
  detail?: string;
  insufficient_data?: boolean;

  // 차트 데이터
  chart_data?: TacticalChartData | null;

  // 예시 게임(있을 때만)
  example_game?: { url?: string | null; hint?: string | null } | null;

  // 상세 모달에서 쓰는 게임 목록
  top_games?: PatternGameItem[];

  [key: string]: any;
}

export interface TacticalAnalysis {
  patterns: TacticalPattern[];
  strengths: TacticalPattern[];
  weaknesses: TacticalPattern[];

  cluster_analysis?:
    | {
        overall_win_rate: number;
        n_clusters: number;
        summary: string;
        clusters: ClusterInfo[];
        [key: string]: any;
      }
    | null;

  xgboost_profile?: XGBoostProfile | null;
  ai_insights?: AiInsights | null;

  // 서버가 추가 필드를 내려줄 수 있으므로
  [key: string]: any;
}
