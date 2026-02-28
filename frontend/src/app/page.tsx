import Link from "next/link";
import SearchForm from "@/components/ui/SearchForm";

export default function Home() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] gap-12 text-center overflow-hidden">
      {/* Dot-grid background */}
      <div className="absolute inset-0 dot-grid opacity-[0.15] pointer-events-none" />

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 animate-fade-in relative z-10">
        <span className="text-7xl select-none">♟️</span>
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-white">Fore</span>
          <span className="text-emerald-400">sight</span>
        </h1>
        <p className="text-zinc-400 text-lg max-w-md leading-relaxed">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl mt-4 relative z-10">
        <Link
          href="/analysis"
          className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-xl p-5 text-left hover:border-emerald-500/60 hover:bg-zinc-800/80 transition-all group"
        >
          <div className="text-2xl mb-3">📊</div>
          <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
            퍼포먼스 분석
          </h3>
          <p className="text-zinc-500 text-sm mt-1">
            승률, 오프닝별 통계, 레이팅 트렌드
          </p>
        </Link>
        <Link
          href="/opponent"
          className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-xl p-5 text-left hover:border-emerald-500/60 hover:bg-zinc-800/80 transition-all group"
        >
          <div className="text-2xl mb-3">🎯</div>
          <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
            상대 분석
          </h3>
          <p className="text-zinc-500 text-sm mt-1">
            대회 상대의 패턴 · 오프닝 · 약점 리포트
          </p>
        </Link>
        <Link
          href="/dashboard"
          className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-xl p-5 text-left hover:border-emerald-500/60 hover:bg-zinc-800/80 transition-all group"
        >
          <div className="text-2xl mb-3">🏆</div>
          <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
            대회 준비
          </h3>
          <p className="text-zinc-500 text-sm mt-1">
            Chess.com · Lichess 계정 연동 통합 뷰
          </p>
        </Link>
      </div>
    </div>
  );
}
