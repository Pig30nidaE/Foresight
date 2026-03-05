import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/shared/components/layout/Providers";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Foresight ♟️ | Chess Analytics for Competitors",
  description: "체스 대회 참가자를 위한 AI 기반 대국 분석 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-chess-bg text-chess-primary min-h-screen`}>
        <Providers>
          <header className="border-b border-chess-border/60 bg-chess-bg/80 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center">
              <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight select-none">
                <span className="text-xl leading-none">♟️</span>
                <span className="text-chess-primary">Fore</span>
                <span className="text-chess-accent">sight</span>
              </Link>
            </div>
          </header>
          <main className="max-w-screen-2xl mx-auto px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
