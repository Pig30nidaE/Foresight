import Link from "next/link";
import SearchForm from "@/shared/components/ui/SearchForm";

export default function Home() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] gap-12 text-center overflow-hidden">
      {/* Dot-grid background */}
      <div className="absolute inset-0 dot-grid opacity-[0.15] pointer-events-none" />

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 animate-fade-in relative z-10">
        <span className="text-7xl select-none">♟️</span>
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-chess-primary">Fore</span>
          <span className="text-chess-accent">sight</span>
        </h1>
        <p className="text-chess-muted text-lg max-w-md leading-relaxed">
          체스 대회 참가자를 위한 AI 기반 대국 분석 플랫폼.
          <br />
          오프닝 분석 · 상대 준비 · 약점 파악
        </p>
      </div>

      {/* Search */}
      <div className="relative z-10 w-full flex justify-center">
        <SearchForm />
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mt-4 relative z-10">
        <Link
          href="/opening-tier"
          className="bg-chess-surface/80 backdrop-blur-sm border border-chess-border rounded-xl p-5 text-left hover:border-chess-accent/60 hover:bg-chess-border/60 transition-all group"
        >
          <div className="text-2xl mb-3">📋</div>
          <h3 className="font-semibold text-chess-primary group-hover:text-chess-accent transition-colors">
            오프닝 티어표
          </h3>
          <p className="text-chess-muted text-sm mt-1">
            레이팅 구간별 오프닝 티어
          </p>
        </Link>
        <Link
          href="/dashboard"
          className="bg-chess-surface/80 backdrop-blur-sm border border-chess-border rounded-xl p-5 text-left hover:border-chess-accent/60 hover:bg-chess-border/60 transition-all group"
        >
          <div className="text-2xl mb-3">🎯</div>
          <h3 className="font-semibold text-chess-primary group-hover:text-chess-accent transition-colors">
            전적 검색
          </h3>
          <p className="text-chess-muted text-sm mt-1">
            유저 전적 검색 및 분석
          </p>
        </Link>
      </div>
    </div>
  );
}
