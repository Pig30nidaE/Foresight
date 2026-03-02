"use client";

// ────────────────────────────────────────────────
// Community 페이지 — 미래 기능
// ────────────────────────────────────────────────

export default function CommunityPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">💬 커뮤니티</h1>
        <p className="text-zinc-500 mb-8">공지 게시판 및 커뮤니티 — 준비 중</p>

        <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/40 p-12 text-center">
          <p className="text-zinc-400 text-lg">🚧 개발 예정</p>
          <p className="text-zinc-600 text-sm mt-2">
            구현 시작 위치:{" "}
            <code className="text-amber-400">src/features/community/</code>
          </p>
        </div>
      </div>
    </main>
  );
}
