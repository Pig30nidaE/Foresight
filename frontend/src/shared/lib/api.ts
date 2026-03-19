/**
 * 공용 Axios 인스턴스 + 공유 API 함수
 * 새 기능의 API 함수는 features/<feature>/api.ts 에 추가
 */
import axios from "axios";
import type { Platform, TimeClass, PlayerProfile, GameSummary, PerformanceSummary, SingleGameAnalysis, BothPlayersAnalysis } from "@/shared/types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
  timeout: 30000,
});

export default api;

export const getPlayerProfile = async (
  platform: Platform,
  username: string
): Promise<PlayerProfile> => {
  const { data } = await api.get(`/player/${platform}/${username}`);
  return data;
};

export const getRecentGames = async (
  platform: Platform,
  username: string,
  maxGames = 50,
  timeClass?: TimeClass
): Promise<GameSummary[]> => {
  const params: Record<string, unknown> = { max_games: maxGames };
  if (timeClass) params.time_class = timeClass;
  const { data } = await api.get(`/games/${platform}/${username}`, { params });
  return data;
};

export const getPerformanceSummary = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz"
): Promise<PerformanceSummary> => {
  const { data } = await api.get(`/analysis/performance/${platform}/${username}`, {
    params: { time_class: timeClass },
  });
  return data;
};

export const getOpeningStats = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
  topN = 10
) => {
  const { data } = await api.get(`/analysis/openings/${platform}/${username}`, {
    params: { time_class: timeClass, top_n: topN },
  });
  return data;
};

// 개별 게임 분석 API (양쪽 플레이어)
export const analyzeGameBothPlayers = async (
  pgn: string,
  gameId: string,
  timePerMove = 0.15
): Promise<BothPlayersAnalysis> => {
  try {
    const { data } = await api.post(
      "/game-analysis/game",
      {
        pgn,
        game_id: gameId,
        time_per_move: timePerMove,
      },
      {
        // 분석은 수가 많으면 30초를 쉽게 초과합니다. (기본 axios timeout=30s)
        timeout: 180_000,
      }
    );
    // #region agent log
    fetch('http://127.0.0.1:7481/ingest/be5a306c-8cb7-4841-9b1f-99923455307e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2df934'},body:JSON.stringify({sessionId:'2df934',runId:'post-fix',hypothesisId:'H1',location:'frontend/src/shared/lib/api.ts:analyzeGameBothPlayers',message:'api_success',data:{gameId, timePerMove, pgnChars:(pgn?.length??0), timeoutMs:180000},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return data;
  } catch (err: any) {
    const isAxios = !!err?.isAxiosError;
    const status = err?.response?.status ?? null;
    const code = err?.code ?? null; // e.g. ECONNABORTED on timeout
    const msg = String(err?.message ?? err).slice(0, 300);
    // #region agent log
    fetch('http://127.0.0.1:7481/ingest/be5a306c-8cb7-4841-9b1f-99923455307e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2df934'},body:JSON.stringify({sessionId:'2df934',runId:'post-fix',hypothesisId:'H1',location:'frontend/src/shared/lib/api.ts:analyzeGameBothPlayers',message:'api_error',data:{gameId,timePerMove,isAxios,status,code,msg,timeoutMs:180000},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw err;
  }
};

// 하위 호환: 단일 플레이어 분석
export const analyzeSingleGame = async (
  pgn: string,
  username: string,
  gameId: string,
  timePerMove = 0.15
): Promise<SingleGameAnalysis> => {
  const result = await analyzeGameBothPlayers(pgn, gameId, timePerMove);
  
  // 양쪽 분석 중 해당 유저의 분석만 반환
  const targetAnalysis = 
    result.white_analysis.username.toLowerCase() === username.toLowerCase()
      ? result.white_analysis
      : result.black_analysis;
  
  return {
    game_id: result.game_id,
    username: targetAnalysis.username,
    user_color: targetAnalysis.color,
    total_moves: targetAnalysis.total_moves,
    analyzed_moves: targetAnalysis.analyzed_moves,
    tier_counts: targetAnalysis.tier_counts as Record<"T1" | "T2" | "T3" | "T4" | "T5", number>,
    tier_percentages: targetAnalysis.tier_percentages as Record<"T1" | "T2" | "T3" | "T4" | "T5", number>,
    avg_cp_loss: targetAnalysis.avg_cp_loss,
    accuracy: targetAnalysis.accuracy,
  };
};
