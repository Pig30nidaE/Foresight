export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }
  return secret;
}

/** HS256 key for /api/backend-jwt — must match backend JWT verification (BRIDGE_JWT_SECRET or JWT_SECRET). */
export function getBridgeJwtSigningSecret(): string {
  const bridge = process.env.BRIDGE_JWT_SECRET?.trim();
  if (bridge) {
    return bridge;
  }
  return getAuthSecret();
}
