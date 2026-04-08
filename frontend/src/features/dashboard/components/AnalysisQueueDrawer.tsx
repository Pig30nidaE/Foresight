"use client";

import { useState } from "react";
import { useAnalysisQueue } from "../contexts/AnalysisQueueContext";
import type { QueueItemStatus } from "../contexts/AnalysisQueueContext";
import { useTranslation } from "@/shared/lib/i18n";
import { PixelXGlyph, PixelChartGlyph, PixelCheckGlyph, PixelWarnGlyph } from "@/shared/components/ui/PixelGlyphs";
import { buildGameAnalysisHrefFromDashboard } from "@/shared/lib/gameAnalysisHref";

function statusIcon(status: QueueItemStatus) {
  switch (status) {
    case "queued":
      return <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />;
    case "analyzing":
      return <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />;
    case "complete":
      return <PixelCheckGlyph size={12} className="text-chess-win" />;
    case "error":
      return <PixelWarnGlyph size={12} className="text-chess-loss" />;
  }
}

function statusLabel(status: QueueItemStatus, t: (k: string) => string) {
  switch (status) {
    case "queued":
      return t("queue.waiting");
    case "analyzing":
      return t("queue.analyzing");
    case "complete":
      return t("queue.complete");
    case "error":
      return t("queue.error");
  }
}

export default function AnalysisQueueDrawer() {
  const { t } = useTranslation();
  const { items, remove, clearCompleted } = useAnalysisQueue();
  const [open, setOpen] = useState(false);

  const activeCount = items.filter((i) => i.status === "queued" || i.status === "analyzing").length;
  const completedCount = items.filter((i) => i.status === "complete").length;
  const totalCount = items.length;

  if (totalCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="pixel-frame bg-chess-bg/95 dark:bg-chess-elevated/95 backdrop-blur-sm w-72 sm:w-80 max-h-80 overflow-hidden flex flex-col shadow-xl border-2 border-chess-border">
          <div className="flex items-center justify-between px-3 py-2 border-b border-chess-border/50 bg-chess-surface/50 dark:bg-chess-bg/60">
            <h4 className="font-pixel text-xs font-bold text-chess-primary flex items-center gap-1.5">
              <PixelChartGlyph size={14} />
              {t("queue.title")}
              <span className="text-chess-muted font-normal">({totalCount})</span>
            </h4>
            <div className="flex items-center gap-1">
              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="font-pixel text-[10px] text-chess-muted hover:text-chess-primary px-1.5 py-0.5"
                >
                  {t("queue.clearDone")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-chess-muted hover:text-chess-primary p-0.5"
              >
                <PixelXGlyph size={12} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-chess-border/30">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  const canOpen = item.status === "complete";
                  if (!canOpen || !item.gameId) return;

                  const href = buildGameAnalysisHrefFromDashboard(item.dashboardHref, item.gameId);
                  window.open(href, "_blank", "noopener");
                  setOpen(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                  item.status === "complete"
                    ? "hover:bg-chess-surface/50 dark:hover:bg-chess-elevated/50 cursor-pointer"
                    : "cursor-default opacity-85"
                }`}
              >
                <div className="shrink-0">{statusIcon(item.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-chess-primary truncate">{item.label}</p>
                  <p className="text-[10px] text-chess-muted">
                    {statusLabel(item.status, t as (k: string) => string)}
                    {item.status === "analyzing" && item.totalMoves > 0 && (
                      <span className="ml-1">
                        ({item.progress}/{item.totalMoves})
                      </span>
                    )}
                  </p>
                  {item.status === "analyzing" && item.totalMoves > 0 && (
                    <div className="mt-1 h-1 w-full bg-chess-border/30 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${Math.round((item.progress / item.totalMoves) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(item.id);
                  }}
                  className="shrink-0 text-chess-muted hover:text-chess-loss transition-colors p-0.5"
                  title={t("queue.remove")}
                >
                  <PixelXGlyph size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative pixel-btn bg-chess-surface/90 dark:bg-chess-elevated/80 border-2 border-chess-border p-2.5 shadow-lg hover:shadow-xl transition-shadow"
      >
        <PixelChartGlyph size={20} className="text-chess-primary" />
        {activeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold px-1 animate-pulse">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}
