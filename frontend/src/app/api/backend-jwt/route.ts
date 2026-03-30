import { SignJWT } from "jose";

import { auth } from "@/auth";
import { bridgeJwtExpireSeconds } from "@/lib/bridgeJwt";
import { getBridgeJwtSigningSecret } from "@/lib/authSecret";

const encoder = new TextEncoder();

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ detail: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const provider = String((session as any).provider ?? "");
  const providerAccountId = String((session as any).providerAccountId ?? "");

  if (!provider || !providerAccountId) {
    return new Response(JSON.stringify({ detail: "Missing provider claims in session" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const jwtSecret = encoder.encode(getBridgeJwtSigningSecret());
  const now = Math.floor(Date.now() / 1000);
  const exp = now + bridgeJwtExpireSeconds();

  const token = await new SignJWT({
    provider,
    provider_account_id: providerAccountId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    picture: session.user.image ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(process.env.JWT_ISSUER ?? "foresight.local")
    .setSubject(`${provider}:${providerAccountId}`)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(jwtSecret);

  return new Response(JSON.stringify({ token, access_token: token }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
