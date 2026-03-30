import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";

import { getAuthSecret } from "@/lib/authSecret";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
  providers.push(
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    })
  );
}

/** 세션 쿠키 최대 수명(초). 기본 30분. */
const sessionMaxAgeSeconds = Math.max(
  300,
  Number.parseInt(process.env.AUTH_SESSION_MAX_AGE_SECONDS ?? "1800", 10) || 1800
);
/** 세션을 갱신하기 전 최소 간격(초). 기본 5분. */
const sessionUpdateAgeSeconds = Math.max(
  60,
  Number.parseInt(process.env.AUTH_SESSION_UPDATE_AGE_SECONDS ?? "300", 10) || 300
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: getAuthSecret(),
  providers,
  pages: {
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    maxAge: sessionMaxAgeSeconds,
    updateAge: sessionUpdateAgeSeconds,
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.includes("/api/auth/callback/")) {
        return `${baseUrl}/post-login`;
      }
      if (url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}/post-login`;
      }
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      try {
        const target = new URL(url);
        if (target.origin === baseUrl) return url;
      } catch {
        // ignore parsing failure
      }
      return baseUrl;
    },
    async jwt({ token, profile, account }) {
      if (account?.provider) {
        token.provider = account.provider;
      }
      if (account?.providerAccountId) {
        token.providerAccountId = account.providerAccountId;
      }
      if (profile && "email" in profile && profile.email) {
        token.email = profile.email as string;
      }
      return token;
    },
    async session({ session, token }) {
      const s = session as any;
      s.provider = token.provider;
      s.providerAccountId = token.providerAccountId;
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
      }
      return session;
    },
  },
});
