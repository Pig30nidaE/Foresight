import Link from "next/link";
import SearchForm from "@/components/ui/SearchForm";

export default function Home() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] gap-10 text-center overflow-hidden">
      {/* Dot-grid background */}
      <div className="absolute inset-0 dot-grid opacity-[0.15] pointer-events-none" />

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 animate-fade-in relative z-10">
        <span className="text-7xl select-none">♟️</span>
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-white">Fore</span>
          <span className="text-emerald-400">sight</span>
        </h1>
        <p className="text-zinc-400 text-lg max-w-lg leading-relaxed">
          체스 대회 참가자를 위한 AI 기반 대국 분석 플랫폼.
          <br />
          레이팅 트렌드 · 오프닝 약점 · 상대 준비 전략
        </p>
      </div>

      {/* Search */}
      <div className="relative z-10 w-full flex justify-center">
        <SearchForm />
      </div>

      {/* Feature Cards — 2개로 통합 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mt-2 relative z-10">
        <Link
          href="/dashboard"
          className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-xl p-6 text-left hover:border-emerald-500/60 hover:bg-zinc-800/80 transition-all group"
        >
          <div className="text-2xl mb-3">📊</div>
          <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors mb-1">
            내 분석
          </h3>
          <p className="text-zinc-500 text-sm leading-relaxed">
            승/패/무 퍼포먼스 · 레이팅 트렌드 · 오프닝 트리 · 시간 압박 분석 · 전술 패턴 · Stockfish 수 품질
          </p>
        </Link>
        <Link
          href="/opponent"
          className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-xl p-6 text-left hover:border-emerald-500/60 hover:bg-zinc-800/80 transition-all group"
        >
          <div className="text-2xl mb-3">🎯</div>
          <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors mb-1">
            상대 분석
          </h3>
          <p className="text-zinc-500 text-sm leading-relaxed">
            대회 상대 ECO 약점 · 페이즈별 수 품질 · LightGBM 블런더 트리거 · K-Means 스타일 군집 · 준비 전략 도출
          </p>
        </Link>
      </div>

      {/* 기능 요약 스트립 */}
      <div className="relative z-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-600 max-w-2xl">
        {[
          "Chess.com / Lichess 연동",
          "Stockfish v18 엔진",
          "LightGBM 블런더 예측",
          "K-Means 스타일 군집화",
          "기간 필터 지원",
        ].map((f) => (
          <span key={f} className="flex items-center gap-1">
            <span className="text-emerald-600">✓</span> {f}
          </span>
        ))}
      </div>
    </div>
  );
}

