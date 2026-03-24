"use client";

import ForumPostThumbnail from "@/app/forum/ForumPostThumbnail";
import { useTranslation } from "@/shared/lib/i18n";

type ForumBoardPeekCardProps = {
  /** 보드가 연결된 경우 true */
  imported: boolean;
  /** 연결됐을 때 미리보기 FEN (PGN 최종 또는 보드 상태) */
  previewFen: string | null;
  /** 미리보기 클릭: 미연결이면 불러오기, 연결이면 편집 창 */
  onActivate: () => void;
};

export default function ForumBoardPeekCard({ imported, previewFen, onActivate }: ForumBoardPeekCardProps) {
  const { t } = useTranslation();
  const showBoard = Boolean(imported && previewFen);

  return (
    <div className="mb-3 flex w-full justify-center">
      <button
        type="button"
        onClick={onActivate}
        className="relative aspect-square w-[min(100%,14rem)] shrink-0 overflow-hidden pixel-frame bg-chess-surface outline-none transition-colors hover:border-chess-accent/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-chess-accent sm:w-[min(100%,15rem)]"
        aria-label={imported ? t("forum.peek.openEdit") : t("forum.peek.import")}
      >
        {showBoard ? (
          <ForumPostThumbnail thumbnailFen={previewFen} />
        ) : (
          <span
            className="flex h-full min-h-[9.5rem] w-full items-center justify-center text-6xl font-extralight leading-none text-chess-muted/40 select-none sm:min-h-[10.5rem] sm:text-7xl"
            aria-hidden
          >
            +
          </span>
        )}
      </button>
    </div>
  );
}
