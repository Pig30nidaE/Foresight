// ============================================================
// Opponent 기능 전용 타입 — Dev1 담당 영역
// ============================================================
import type { OpeningStats } from "@/shared/types";

export interface OpponentAnalysis {
  username: string;
  platform: string;
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
