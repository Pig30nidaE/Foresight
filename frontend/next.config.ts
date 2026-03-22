import type { NextConfig } from "next";

/** layout/apiBaseUrl.ts 와 동일 우선순위 (rewrites는 빌드 시 고정) */
const publicApiBase =
  process.env.FORESIGHT_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API ||
  "http://localhost:8000/api/v1";

const nextConfig: NextConfig = {
  // Azure Container Apps / Docker 등 Node 러너 배포용 (frontend/Dockerfile)
  output: "standalone",
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

export default nextConfig;
