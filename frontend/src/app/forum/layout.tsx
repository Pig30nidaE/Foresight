import type { ReactNode } from "react";

export default function ForumLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="pixel-frame bg-chess-surface/65 px-4 py-4 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wide text-chess-muted">Community</p>
        <h1 className="mt-1 text-2xl font-bold text-chess-primary">포럼</h1>
        <p className="mt-2 text-sm text-chess-muted">
          카드 격자로 글을 둘러보고, PGN·시작 FEN을 첨부할 수 있습니다. 글쓰기·댓글·좋아요는 가입 완료 후 이용할 수 있습니다.
        </p>
      </header>
      <div className="min-h-[12rem]">{children}</div>
    </div>
  );
}
