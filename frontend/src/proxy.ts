import { NextRequest, NextResponse } from "next/server";

function resolveApiOrigin(): string | null {
  const base =
    process.env.FORESIGHT_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API ||
    "http://localhost:8000/api/v1";

  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

function buildCsp(nonce: string): string {
  const connectSrc = ["'self'", "https:", "wss:"];
  const apiOrigin = resolveApiOrigin();
  if (apiOrigin && !connectSrc.includes(apiOrigin)) {
    connectSrc.push(apiOrigin);
  }

  const scriptSrc = ["'self'", "'unsafe-inline'", "https://vercel.live"];
  const scriptSrcElem = ["'self'", "'unsafe-inline'", "https://vercel.live"];
  const fontSrc = ["'self'", "data:", "https://cdn.jsdelivr.net"];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `script-src-elem ${scriptSrcElem.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    `connect-src ${connectSrc.join(" ")}`,
    `font-src ${fontSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
