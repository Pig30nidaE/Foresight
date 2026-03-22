import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Azure Container Apps / Docker 등 Node 러너 배포용 (frontend/Dockerfile)
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/:path*`,
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
