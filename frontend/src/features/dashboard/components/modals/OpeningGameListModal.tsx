"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { OpeningTreeNode, PatternGameItem } from "@/types";
import { useTranslation } from "@/shared/lib/i18n";
import { useBodyScrollLock } from "@/shared/lib/useBodyScrollLock";
import { PixelXGlyph } from "@/shared/components/ui/PixelGlyphs";

interface Props {
  node: OpeningTreeNode | null;
  onClose: () => void;
}

// Chess.com 게임 URL → 분석 URL 변환
function toAnalysisUrl(url: string): string {
  if (!url) return url;
  const cdotcom = url.match(/^(https?:\/\/(?:www\.)?chess\.com)\/game\/(live|daily)\/(\w+)/);
  if (cdotcom) return `${cdotcom[1]}/analysis/game/${cdotcom[2]}/${cdotcom[3]}/analysis`;
  if (/lichess\.org\/[A-Za-z0-9]+(?:\?|#|$)/.test(url)) return url.replace(/(\?.*)?$/, "#analysis");
  return url;
}

function getResultStyle(t: any, r: "win" | "loss" | "draw") {
  const map = {
    win:  { label: t("term.win"), cls: "bg-emerald-700/10 text-chess-win border-emerald-700/30" },
    loss: { label: t("term.loss"), cls: "bg-red-600/10 text-chess-loss border-red-600/30" },
    draw: { label: t("term.draw"), cls: "bg-chess-border/30 text-chess-muted border-chess-muted/30" },
  };
  return map[r];
}

const RESULT_DOT: Record<string, string> = {
  win:  "bg-emerald-600",
  loss: "bg-red-600",
  draw: "bg-chess-muted",
};

function GameRow({ game, rank, t }: { game: any; rank: number; t: any }) {
  const badge = getResultStyle(t, game.result) ?? getResultStyle(t, "draw");
  const dot   = RESULT_DOT[game.result]  ?? RESULT_DOT.draw;

  return (
    <a
      href={toAnalysisUrl(game.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-chess-border bg-chess-surface/60
                 px-4 py-3 hover:border-chess-primary hover:bg-chess-surface transition-all duration-150"
    >
      <span className="text-xs font-mono text-chess-muted w-5 shrink-0 text-right">#{rank}</span>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-chess-primary font-medium truncate leading-snug">
          {game.opening_name ?? t("pattern.noOpeningInfo")}
        </p>
        <p className="text-xs text-chess-muted mt-0.5">
            {game.played_at ? new Date(game.played_at).toLocaleDateString(t("term.win") === "Win" ? "en-US" : "ko-KR", { year: "numeric", month: "short", day: "numeric" }) : t("pattern.unknownDate")}
          {game.white && game.black && (
            <span className="ml-2 opacity-70">{game.white} vs {game.black}</span>
          )}
        </p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 font-semibold ${badge.cls}`}>
        {badge.label}
      </span>
      <span className="text-chess-muted group-hover:text-chess-primary transition-colors text-sm shrink-0">→</span>
    </a>
  );
}

export default function OpeningGameListModal({ node, onClose }: Props) {
  const { t } = useTranslation();
  useBodyScrollLock(!!node);

  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, node]);

  if (!node) return null;

  const games = node.top_games ?? [];
  const total = node.games;
  const winRate = node.win_rate;
  const winRateColor =
    winRate >= 50 ? "text-chess-win" : "text-chess-loss";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden overscroll-none bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl h-[85dvh] max-h-[85vh] min-h-0 flex flex-col
                   bg-chess-bg border border-chess-border/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-chess-border">
          <div className="flex-1 min-w-0">
            {node.eco_prefix && (
              <span className="text-xs font-mono font-bold text-chess-accent mb-1 block">
                {node.eco_prefix}
              </span>
            )}
            <h2 className="text-lg font-bold text-chess-primary leading-tight">
              {node.name.includes(":") ? node.name.split(":", 2)[1].trim() : node.name}
            </h2>
            <p className="text-sm text-chess-muted mt-1">
              <span dangerouslySetInnerHTML={{ __html: t("pattern.totalGames").replace("{n}", `<span class="text-chess-primary font-semibold">${total}</span>`) }} />
            </p>
          </div>

          {/* Win rate badge */}
          <div className="flex flex-col items-center shrink-0">
            <span className={`text-2xl font-black ${winRateColor}`}>{winRate}%</span>
            <span className="text-xs text-chess-muted">{t("pattern.winRate")}</span>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-chess-muted hover:text-chess-primary transition-colors mt-0.5 p-0.5"
            aria-label={t("sac.close")}
          >
            <PixelXGlyph size={20} />
          </button>
        </div>

        {/* W/D/L bar */}
        <div className="shrink-0 px-6 py-3 border-b border-chess-border/60">
          <div className="flex gap-2 text-xs mb-2">
            <span className="text-chess-win font-semibold">{node.wins}{t("term.win").substring(0, 1).toUpperCase()}</span>
            <span className="text-chess-muted">/</span>
            <span className="text-chess-muted">{node.draws}{t("term.draw").substring(0, 1).toUpperCase()}</span>
            <span className="text-chess-muted">/</span>
            <span className="text-chess-loss font-semibold">{node.losses}{t("term.loss").substring(0, 1).toUpperCase()}</span>
          </div>
          {total > 0 && (
            <div className="flex w-full h-1.5 rounded-full overflow-hidden gap-px">
              <div
                className="bg-emerald-600 rounded-l-full"
                style={{ width: `${(node.wins / total) * 100}%` }}
              />
              <div
                className="bg-chess-muted"
                style={{ width: `${(node.draws / total) * 100}%` }}
              />
              <div
                className="bg-red-600 rounded-r-full flex-1"
              />
            </div>
          )}
        </div>

        {/* Game list */}
        <div
          data-modal-scroll="true"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-2 [-webkit-overflow-scrolling:touch]"
        >
          {games.length === 0 ? (
            <div className="py-12 text-center text-chess-muted text-sm border-t border-chess-border/50">
              {t("pattern.noGameLink")}
            </div>
          ) : (
            games.map((g, i) => <GameRow key={g.url} game={g} rank={i + 1} t={t} />)
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-chess-border text-center">
          <p className="text-xs text-chess-muted">
            {t("pattern.recentGamesHelp").replace("{n}", String(games.length))}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
