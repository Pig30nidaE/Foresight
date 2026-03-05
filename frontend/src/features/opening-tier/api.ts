/**
 * Opening Tier 기능 API
 * ─────────────────────────────────────────
 * Endpoint: GET /api/v1/opening-tier/*
 */
import api from "@/shared/lib/api";
import type { OpeningTierResponse, BracketsResponse } from "./types";

export const getOpeningTiers = async (
  rating: number,
  speed: string,
  color: string
): Promise<OpeningTierResponse> => {
  const { data } = await api.get("/opening-tier/global", {
    params: { rating, speed, color },
    timeout: 300_000, // BFS 탐색은 첫 요청 시 최대 2–3분 소요
  });
  return data as OpeningTierResponse;
};

export const getRatingBrackets = async (
  speed: string
): Promise<BracketsResponse> => {
  const { data } = await api.get("/opening-tier/brackets", {
    params: { speed },
  });
  return data as BracketsResponse;
};

export { api };
