"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { OpeningTreeNode, PatternGameItem } from "@/types";

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

const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  win:  { label: "승리", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  loss: { label: "패배", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  draw: { label: "무승부", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-600/30" },
};

const RESULT_DOT: Record<string, string> = {
  win:  "bg-emerald-400",
  loss: "bg-red-400",
  draw: "bg-zinc-400",
};

function GameRow({ game, rank }: { game: PatternGameItem; rank: number }) {
  const badge = RESULT_BADGE[game.result] ?? RESULT_BADGE.draw;
  const dot   = RESULT_DOT[game.result]  ?? RESULT_DOT.draw;

  return (
    <a
      href={toAnalysisUrl(game.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60
                 px-4 py-3 hover:border-zinc-600 hover:bg-zinc-800/60 transition-all duration-150"
    >
      <span className="text-xs font-mono text-zinc-600 w-5 shrink-0 text-right">#{rank}</span>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 font-medium truncate leading-snug">
          {game.opening_name ?? "오프닝 정보 없음"}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {game.played_at
            ? new Date(game.played_at).toLocaleDateString("ko-KR", {
                year: "numeric", month: "short", day: "numeric",
              })
            : "날짜 불명"}
          {game.white && game.black && (
            <span className="ml-2 opacity-70">{game.white} vs {game.black}</span>
          )}
        </p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 font-semibold ${badge.cls}`}>
        {badge.label}
      </span>
      <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors text-sm shrink-0">→</span>
    </a>
  );
}

export default function OpeningGameListModal({ node, onClose }: Props) {
  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, node]);

  if (!node) return null;

  const games = node.top_games ?? [];
  const total = node.games;
  const winRate = node.win_rate;
  const winRateColor =
    winRate >= 55 ? "text-emerald-400" :
    winRate >= 45 ? "text-amber-400"   : "text-red-400";
  const winRateBg =
    winRate >= 55 ? "bg-emerald-500" :
    winRate >= 45 ? "bg-amber-500"   : "bg-red-500";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[85vh] flex flex-col
                   bg-zinc-950 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-zinc-800">
          <div className="flex-1 min-w-0">
            {node.eco_prefix && (
              <span className="text-xs font-mono font-bold text-amber-300 mb-1 block">
                {node.eco_prefix}
              </span>
            )}
            <h2 className="text-lg font-bold text-zinc-100 leading-tight">
              {node.name.includes(":") ? node.name.split(":", 2)[1].trim() : node.name}
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              총 <span className="text-zinc-300 font-semibold">{total}</span>게임
            </p>
          </div>

          {/* Win rate badge */}
          <div className="flex flex-col items-center shrink-0">
            <span className={`text-2xl font-black ${winRateColor}`}>{winRate}%</span>
            <span className="text-xs text-zinc-500">승률</span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors text-xl leading-none mt-0.5"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* W/D/L bar */}
        <div className="px-6 py-3 border-b border-zinc-800/60">
          <div className="flex gap-2 text-xs mb-2">
            <span className="text-emerald-400 font-semibold">{node.wins}승</span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400">{node.draws}무</span>
            <span className="text-zinc-500">/</span>
            <span className="text-red-400 font-semibold">{node.losses}패</span>
          </div>
          {total > 0 && (
            <div className="flex w-full h-1.5 rounded-full overflow-hidden gap-px">
              <div
                className="bg-emerald-500 rounded-l-full"
                style={{ width: `${(node.wins / total) * 100}%` }}
              />
              <div
                className="bg-zinc-500"
                style={{ width: `${(node.draws / total) * 100}%` }}
              />
              <div
                className="bg-red-500 rounded-r-full flex-1"
              />
            </div>
          )}
        </div>

        {/* Game list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {games.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-8">
              게임 링크 데이터가 없습니다.
            </p>
          ) : (
            games.map((g, i) => <GameRow key={g.url} game={g} rank={i + 1} />)
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 text-center">
          <p className="text-xs text-zinc-600">
            최근 {games.length}게임 표시 · 클릭하여 분석 보드에서 게임 리뷰
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
