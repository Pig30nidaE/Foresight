/**
 * Opening Tier 기능 API
 * ─────────────────────────────────────────
 * Endpoint: GET /api/v1/opening-tier/*
 */
import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import type { OpeningTierResponse, BracketsResponse, OpeningDetail } from "./types";

const OPENING_TIER_CLIENT_HEADER = {
  "X-Foresight-Client": "web-ui",
};

/** UI에서 `forum.error.loginRequired` 등으로 매핑 */
export const OPENING_TIER_AUTH_REQUIRED = "OPENING_TIER_AUTH_REQUIRED";

async function openingTierAuthHeaders(): Promise<Record<string, string>> {
  const token = await getBackendJwt();
  if (!token) {
    throw new Error(OPENING_TIER_AUTH_REQUIRED);
  }
  return {
    ...OPENING_TIER_CLIENT_HEADER,
    Authorization: `Bearer ${token}`,
  };
}

export const getOpeningTiers = async (
  rating: number,
  speed: string,
  color: string,
  q?: string
): Promise<OpeningTierResponse> => {
  const { data } = await api.get("/opening-tier/global", {
    params: { rating, speed, color, q: q?.trim() || undefined },
    headers: await openingTierAuthHeaders(),
    timeout: 300_000, // BFS 탐색은 첫 요청 시 최대 2–3분 소요
  });
  return data as OpeningTierResponse;
};

export const getRatingBrackets = async (
  speed: string
): Promise<BracketsResponse> => {
  const { data } = await api.get("/opening-tier/brackets", {
    params: { speed },
    headers: await openingTierAuthHeaders(),
  });
  return data as BracketsResponse;
};

export const getOpeningDetail = async (
  eco: string,
  name: string,
  color: string = "white"
): Promise<OpeningDetail> => {
  const { data } = await api.get("/opening-tier/detail", {
    params: { eco, name, color },
    headers: await openingTierAuthHeaders(),
    timeout: 30_000,
  });
  return data as OpeningDetail;
};

export { api };
