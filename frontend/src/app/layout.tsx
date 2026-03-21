import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/shared/components/layout/Providers";
import Navbar from "@/shared/components/layout/Navbar";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://fsight.app"),
  title: {
    default: "Foresight ♟️ | Chess Analytics for Competitors",
    template: "%s | Foresight ♟️",
  },
  description:
    "체스 유저를 위한 분석 플랫폼. 오프닝 티어, 승률 분석, 게임 히스토리 등 경쟁력 있는 체스를 위한 데이터 인사이트를 제공합니다.",
  keywords: [
    "chess",
    "체스",
    "chess analytics",
    "체스 분석",
    "opening tier",
    "chess.com",
    "lichess",
    "foresight",
  ],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://fsight.app",
    siteName: "Foresight",
    title: "Foresight ♟️ | Chess Analytics for Competitors",
    description:
      "체스 유저를 위한 분석 플랫폼. 오프닝 티어, 승률 분석, 게임 히스토리 등 경쟁력 있는 체스를 위한 데이터 인사이트를 제공합니다.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Foresight ♟️ | Chess Analytics for Competitors",
    description:
      "체스 유저를 위한 분석 플랫폼. 오프닝 티어, 승률 분석, 게임 히스토리 등 경쟁력 있는 체스를 위한 데이터 인사이트를 제공합니다.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body
        className={`${inter.className} min-h-screen bg-[var(--background)] text-[var(--foreground)]`}
      >
        <Providers>
          <Navbar />
          <main className="max-w-screen-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10">{children}</main>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
