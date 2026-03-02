"use client";

// ────────────────────────────────────────────────
// Opening Tier 페이지 — Dev2 담당 영역
// 오프닝 티어표 기능을 이 파일에 구현하세요.
// ────────────────────────────────────────────────

export default function OpeningTierPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">📊 오프닝 티어표</h1>
        <p className="text-zinc-500 mb-8">Dev2 구현 예정 — 오프닝별 승률 기반 S/A/B/C/D 티어 랭킹</p>

        <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/40 p-12 text-center">
          <p className="text-zinc-400 text-lg">🚧 개발 중</p>
          <p className="text-zinc-600 text-sm mt-2">
            구현 시작 위치:{" "}
            <code className="text-amber-400">src/features/opening-tier/</code>
          </p>
        </div>
      </div>
    </main>
  );
}
