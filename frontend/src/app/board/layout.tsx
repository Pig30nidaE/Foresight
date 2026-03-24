import type { ReactNode } from "react";

export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="rounded-xl border border-chess-border bg-chess-surface/60 px-4 py-4 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wide text-chess-muted">Community</p>
        <h1 className="mt-1 text-2xl font-bold text-chess-primary">게시판</h1>
        <p className="mt-2 text-sm text-chess-muted">
          공지·패치노트·자유글을 한 줄 목록으로 봅니다. 공지와 패치노트는 관리자만 작성할 수 있습니다.
        </p>
      </header>
      <div className="min-h-[12rem]">{children}</div>
    </div>
  );
}
