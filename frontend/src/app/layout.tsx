import type { Metadata, Viewport } from "next";
import { Jersey_25, VT323 } from "next/font/google";
import "./globals.css";
import Providers from "@/shared/components/layout/Providers";
import Navbar from "@/shared/components/layout/Navbar";
import { Analytics } from "@vercel/analytics/next";
import { resolveApiBaseUrl } from "@/shared/lib/apiBaseUrl";

const jersey25 = Jersey_25({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

const vt323Legacy = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel-legacy",
});

export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://fsight.app"),
  title: "foresight-chess",
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
    "foresight-chess",
  ],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://fsight.app",
    siteName: "foresight-chess",
    title: "foresight-chess",
    description:
      "체스 유저를 위한 분석 플랫폼. 오프닝 티어, 승률 분석, 게임 히스토리 등 경쟁력 있는 체스를 위한 데이터 인사이트를 제공합니다.",
    images: [
      {
        url: "/images/foresight-chess-thumbnail.png",
        width: 252,
        height: 217,
        alt: "foresight-chess",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "foresight-chess",
    description:
      "체스 유저를 위한 분석 플랫폼. 오프닝 티어, 승률 분석, 게임 히스토리 등 경쟁력 있는 체스를 위한 데이터 인사이트를 제공합니다.",
    images: ["/images/foresight-chess-thumbnail.png"],
  },
  icons: {
    icon: "/images/foresight-chess-thumbnail.png",
    shortcut: "/images/foresight-chess-thumbnail.png",
    apple: "/images/foresight-chess-thumbnail.png",
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
  const apiBaseUrl = resolveApiBaseUrl();

  return (
    <html lang="ko">
      <head>
        <meta name="google-adsense-account" content="ca-pub-5762865853978682" />
      </head>
      <body
        className={`${jersey25.variable} ${vt323Legacy.variable} min-h-screen bg-[var(--background)] text-[var(--foreground)]`}
      >
        <Providers apiBaseUrl={apiBaseUrl}>
          <Navbar />
          <main className="relative z-0 max-w-screen-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
            {children}
          </main>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
