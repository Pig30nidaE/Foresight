/**
 * Opponent 기능 API — Dev1 담당 영역
 */
import api from "@/shared/lib/api";
import type { Platform, TimeClass } from "@/shared/types";
import type { OpponentAnalysis } from "./types";

export const getOpponentAnalysis = async (
  platform: Platform,
  username: string,
  timeClass: TimeClass = "blitz",
): Promise<OpponentAnalysis> => {
  const { data } = await api.get(`/analysis/opponent/${platform}/${username}`, {
    params: { time_class: timeClass },
  });
  return data;
};
