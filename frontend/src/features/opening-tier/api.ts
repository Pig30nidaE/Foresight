/**
 * 오프닝 티어 API
 * ─────────────────────────────────────────
 * Endpoint: GET /api/v1/opening-tier/*
 * 로그인 필요. 백엔드는 이 라우트에서 JWT를 요구함.
 */
import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import type { OpeningTierResponse, BracketsResponse, OpeningDetail } from "./types";

/** 선택적 식별(로그 없이 공개 조회 가능). */
const OPENING_TIER_HEADERS = {
  "X-Foresight-Client": "web-ui",
} as const;

export const getOpeningTiers = async (
  rating: number,
  speed: string,
  color: string,
  q?: string
): Promise<OpeningTierResponse> => {
  const token = await getBackendJwt();
  const { data } = await api.get("/opening-tier/global", {
    params: { rating, speed, color, q: q?.trim() || undefined },
    headers: { ...OPENING_TIER_HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    timeout: 300_000,
  });
  return data as OpeningTierResponse;
};

export const getRatingBrackets = async (speed: string): Promise<BracketsResponse> => {
  const token = await getBackendJwt();
  const { data } = await api.get("/opening-tier/brackets", {
    params: { speed },
    headers: { ...OPENING_TIER_HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return data as BracketsResponse;
};

export const getOpeningDetail = async (
  eco: string,
  name: string,
  color: string = "white"
): Promise<OpeningDetail> => {
  const token = await getBackendJwt();
  const { data } = await api.get("/opening-tier/detail", {
    params: { eco, name, color },
    headers: { ...OPENING_TIER_HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    timeout: 30_000,
  });
  return data as OpeningDetail;
};

export { api };
