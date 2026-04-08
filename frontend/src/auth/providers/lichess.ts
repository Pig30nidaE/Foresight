import type { OAuth2Config } from "@auth/core/providers/oauth";
import type { TokenSet } from "@auth/core/types";

/**
 * Lichess OAuth2 (Authorization Code + PKCE, 공개 클라이언트 — client_secret 없음).
 * @see https://lichess.org/api#tag/OAuth
 */
export interface LichessProfile extends Record<string, unknown> {
  id: string;
  username?: string;
  email?: string;
}

const defaultUserAgent =
  process.env.AUTH_LICHESS_USER_AGENT ??
  "ForesightChess/1.0 (+https://github.com/Pig30nidaE/Foresight)";

export default function Lichess(
  config: { clientId: string } & Partial<OAuth2Config<LichessProfile>>
): OAuth2Config<LichessProfile> {
  const { clientId, client: userClient, ...rest } = config;
  return {
    ...rest,
    id: "lichess",
    name: "Lichess",
    type: "oauth",
    checks: ["pkce", "state"],
    clientId,
    authorization: {
      url: "https://lichess.org/oauth",
      params: {
        response_type: "code",
        scope: "email:read",
      },
    },
    token: { url: "https://lichess.org/api/token" },
    userinfo: {
      url: "https://lichess.org/api/account",
      async request(context: { tokens: TokenSet }) {
        const { tokens } = context;
        const accessToken = tokens.access_token;
        if (!accessToken) throw new Error("Lichess OAuth: missing access_token");
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": defaultUserAgent,
        };
        const accountRes = await fetch("https://lichess.org/api/account", { headers });
        if (!accountRes.ok) {
          throw new Error(`Lichess /api/account failed: ${accountRes.status}`);
        }
        const profile = (await accountRes.json()) as LichessProfile;
        try {
          const emailRes = await fetch("https://lichess.org/api/account/email", { headers });
          if (emailRes.ok) {
            const data = (await emailRes.json()) as { email?: string };
            if (data?.email) profile.email = data.email;
          }
        } catch {
          /* 이메일 스코프 없거나 실패 시 무시 */
        }
        return profile;
      },
    },
    profile(profile) {
      return {
        id: profile.id,
        name: String(profile.username ?? profile.id),
        email: profile.email ?? null,
        image: null,
      };
    },
    style: {
      brandColor: "#000000",
      logo: "https://lichess1.org/assets/logo/lichess-tile.svg",
    },
    client: {
      token_endpoint_auth_method: "none",
      ...userClient,
    },
  };
}
