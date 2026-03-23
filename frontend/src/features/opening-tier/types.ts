// ============================================================
// Opening Tier 기능 전용 타입
// ============================================================

export type Tier = "S" | "A" | "B" | "C" | "D";
export type Color = "white" | "black";

export interface OpeningTierEntry {
  eco: string;
  name: string;
  tier: Tier;
  white_wins: number;
  draws: number;
  black_wins: number;
  total_games: number;
  win_rate: number;
  draw_rate: number;
  tier_score: number;
  moves: string[] | null;
}

export interface OpeningTierResponse {
  rating: number;
  speed: string;
  color: string;
  total_openings: number;
  data_period: string;
  /** 마지막 수집된 날짜 (YYYY-MM-DD) */
  collected_at: string;
  openings: OpeningTierEntry[];
}

export interface RatingBracket {
  lichess_rating: number;
  chesscom_rating: number;
  label_lichess: string;
  label_chesscom: string;
}

export interface BracketsResponse {
  speed: string;
  brackets: RatingBracket[];
}

export interface OpeningDetail {
  eco: string;
  name: string;
  color: string;
  tips: string[];
  youtube_search_url: string;
}

export const TIER_CONFIG: Record<
  Tier,
  { color: string; bg: string; border: string }
> = {
  S: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  A: {
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  B: {
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  C: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  D: {
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
  },
};
