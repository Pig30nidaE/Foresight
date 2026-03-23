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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.chesscomfiles.com" },
      { protocol: "https", hostname: "lichess1.org" },
    ],
  },
};

module.exports = nextConfig;
