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

// ─────────────────────────────────────────────
// 개별 게임 분석 타입 (T1~T5 등급)
// ─────────────────────────────────────────────

export type MoveTier = "TH" | "T1" | "T2" | "T3" | "T4" | "T5";

export interface TopMoveInfo {
  san: string;
  cp: number;
  rank: number;
}

export interface AnalyzedMove {
  halfmove: number;
  move_number: number;
  color: "white" | "black";
  san: string;
  uci: string;
  fen_before: string;  // 수 전 FEN (체스보드 표시용)
  fen_after: string;   // 수 후 FEN
  cp_before: number | null;
  cp_after: number | null;
  cp_loss: number;
  win_pct_before: number;
  win_pct_after: number;
  win_pct_loss: number;
  tier: MoveTier;
  top_moves: TopMoveInfo[];
  user_move_rank: number;
  is_only_best: boolean;
}

// 개별 플레이어 분석 결과
export interface PlayerAnalysis {
  username: string;
  color: "white" | "black";
  total_moves: number;
  analyzed_moves: AnalyzedMove[];
  tier_counts: Record<MoveTier, number>;
  tier_percentages: Record<MoveTier, number>;
  avg_cp_loss: number;
  accuracy: number;
  moves_by_tier: Record<MoveTier, AnalyzedMove[]>;  // T1~T5별 수 목록
}

// 양쪽 플레이어 분석 응답
export interface BothPlayersAnalysis {
  game_id: string;
  white_player: string;
  black_player: string;
  white_analysis: PlayerAnalysis;
  black_analysis: PlayerAnalysis;
  opening?: {
    eco?: string;
    name?: string;
    th_plies?: number;
    th_fullmoves?: number;
  };
}

// 하위 호환: 단일 플레이어 분석
export interface SingleGameAnalysis {
  game_id: string;
  username: string;
  user_color: "white" | "black";
  total_moves: number;
  analyzed_moves: AnalyzedMove[];
  tier_counts: Record<MoveTier, number>;
  tier_percentages: Record<MoveTier, number>;
  avg_cp_loss: number;
  accuracy: number;
}
