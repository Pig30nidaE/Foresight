let cachedToken: string | null = null;
/** epoch ms; cache invalidated slightly before JWT exp */
let cachedExpiresAtMs: number | null = null;

function jwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = JSON.parse(atob(b64 + pad)) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function clearBackendJwtCache(): void {
  cachedToken = null;
  cachedExpiresAtMs = null;
}

function isCacheValid(): boolean {
  if (!cachedToken) return false;
  const skewMs = 30_000;
  if (cachedExpiresAtMs != null && Date.now() < cachedExpiresAtMs - skewMs) return true;
  const exp = jwtExpMs(cachedToken);
  if (exp == null) return false;
  return Date.now() < exp - skewMs;
}

/**
 * Fetches a short-lived API JWT. Cache respects JWT `exp` (with 30s skew).
 */
export async function getBackendJwt(): Promise<string | null> {
  if (cachedToken && isCacheValid()) return cachedToken;
  cachedToken = null;
  cachedExpiresAtMs = null;
  try {
    const res = await fetch("/api/backend-jwt", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; token?: string };
    const t = data.access_token ?? data.token;
    if (typeof t === "string" && t.length > 0) {
      cachedToken = t;
      cachedExpiresAtMs = jwtExpMs(t);
      return cachedToken;
    }
    return null;
  } catch {
    return null;
  }
}
