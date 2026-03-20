import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/shared/components/layout/Providers";
import Navbar from "@/shared/components/layout/Navbar";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Foresight ♟️ | Chess Analytics for Competitors",
  description: "체스 유저를 위한 분석 플랫폼",
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
