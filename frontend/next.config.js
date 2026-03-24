/** @type {import('next').NextConfig} */
/**
 * 단일 설정 파일 (next.config.js 가 next.config.ts 보다 우선 로드됨).
 * layout/apiBaseUrl 과 동일한 API 베이스 우선순위.
 */
const publicApiBase =
  process.env.FORESIGHT_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API ||
  "http://localhost:8000/api/v1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // frontend/Dockerfile — .next/standalone 복사
  output: "standalone",
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${publicApiBase}/:path*`,
      },
    ];
  },
  /** 유저 검색 허브 제거 — `/profile`만 북마크로 열리면 홈으로 보냄 (`/profile/[id]`는 유지). */
  async redirects() {
    return [{ source: "/profile", destination: "/", permanent: false }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.chesscomfiles.com" },
      { protocol: "https", hostname: "lichess1.org" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https: wss:",
              "font-src 'self' data:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
