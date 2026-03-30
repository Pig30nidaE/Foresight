"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/shared/lib/i18n";

export type ForumRecordedMoveChipsProps = {
  sanList: string[];
  disabled?: boolean;
  /** 삭제 모드에서 i번째 칩 클릭 시: i수만 남기고 해당 수·이후 삭제 (i는 0 … sanList.length) */
  onDeleteFromChipIndex: (keepMoveCount: number) => void;
  /** false가 되면 삭제 모드 해제 */
  active?: boolean;
};

/**
 * 수 기록 중 SAN 칩 나열. 평소에는 표시만, «수순 삭제» 모드에서만 클릭으로 tail 제거.
 */
export default function ForumRecordedMoveChips({
  sanList,
  disabled = false,
  onDeleteFromChipIndex,
  active = true,
}: ForumRecordedMoveChipsProps) {
  const { t } = useTranslation();
  const [deleteMode, setDeleteMode] = useState(false);

  useEffect(() => {
    if (!active) setDeleteMode(false);
  }, [active]);

  if (sanList.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-medium text-chess-muted sm:text-[15px]">{t("forum.editor.moveListTitle")}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDeleteMode((v) => !v)}
          className={`rounded-md border px-2 py-0.5 text-[15px] font-medium sm:text-[15px] ${
            deleteMode
              ? "border-amber-600/70 bg-amber-500/15 text-amber-800 dark:text-amber-200"
              : "border-chess-border bg-chess-surface/70 text-chess-primary"
          } disabled:opacity-40`}
        >
          {deleteMode ? t("forum.editor.moveDeleteModeOn") : t("forum.editor.moveDeleteModeOff")}
        </button>
      </div>
      {deleteMode && (
        <p className="text-[15px] text-chess-muted sm:text-[15px]">{t("forum.editor.moveDeleteHint")}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {sanList.map((san, i) =>
          deleteMode ? (
            <button
              key={`${i}-${san}`}
              type="button"
              disabled={disabled}
              onClick={() => onDeleteFromChipIndex(i)}
              className="rounded border border-chess-border bg-chess-surface/70 px-1.5 py-0.5 text-[15px] font-medium text-chess-primary hover:border-amber-600/60 disabled:opacity-40"
            >
              {san}
            </button>
          ) : (
            <span
              key={`${i}-${san}`}
              className="rounded border border-chess-border/80 bg-chess-surface/40 px-1.5 py-0.5 text-[15px] font-medium text-chess-primary"
            >
              {san}
            </span>
          )
        )}
      </div>
    </>
  );
}
