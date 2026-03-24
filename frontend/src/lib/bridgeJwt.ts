/**
 * Bridge JWT (Next route → FastAPI) TTL must match backend JWT_EXPIRE_MINUTES.
 * Used by GET /api/backend-jwt.
 */
export function bridgeJwtExpireSeconds(): number {
  const fromEnv = Number.parseInt(process.env.BRIDGE_JWT_EXPIRE_SECONDS ?? "", 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 60 && fromEnv <= 86400) {
    return fromEnv;
  }
  const minutes = Number.parseInt(process.env.JWT_EXPIRE_MINUTES ?? "60", 10);
  const m = Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 60;
  return m * 60;
}
