"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { TacticalPattern, PatternGameItem } from "@/types";

interface Props {
  pattern: TacticalPattern | null;
  onClose: () => void;
}

// Chess.com 게임 URL → 분석 URL 변환
// https://www.chess.com/game/live/12345 → https://www.chess.com/analysis/game/live/12345/analysis
// https://lichess.org/GAMEID            → https://lichess.org/GAMEID#analysis
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
      {/* Rank */}
      <span className="text-xs font-mono text-zinc-600 w-5 shrink-0 text-right">#{rank}</span>

      {/* Result dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />

      {/* Opening info */}
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
            <span className="ml-2 opacity-70">
              {game.white} vs {game.black}
            </span>
          )}
        </p>
      </div>

      {/* Result badge */}
      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 font-semibold ${badge.cls}`}>
        {badge.label}
      </span>

      {/* Arrow */}
      <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors text-sm shrink-0">→</span>
    </a>
  );
}

export default function PatternGameListModal({ pattern, onClose }: Props) {
  // ESC 키 닫기
  useEffect(() => {
    if (!pattern) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, pattern]);

  if (!pattern) return null;

  const games: PatternGameItem[] = pattern.top_games ?? [];
  const total = pattern.games_analyzed;
  const scoreColor =
    pattern.score >= 65 ? "text-emerald-400" :
    pattern.score >= 45 ? "text-amber-400"   : "text-red-400";
  const scoreBg =
    pattern.score >= 65 ? "bg-emerald-500" :
    pattern.score >= 45 ? "bg-amber-500"   : "bg-red-500";

  const modal = (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-xl max-h-[85vh] flex flex-col
                   bg-zinc-950 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl leading-none">{pattern.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-zinc-100 leading-snug">
                  {pattern.label}
                </h2>
                {pattern.is_strength ? (
                  <span className="text-xs text-emerald-400 font-bold">★ 강점</span>
                ) : (
                  <span className="text-xs text-red-400 font-bold">▼ 약점</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{pattern.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors text-xl leading-none p-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* Score bar */}
        <div className="px-6 py-3 border-b border-zinc-800/60 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{pattern.detail}</span>
            <span className={`text-sm font-bold ${scoreColor}`}>{pattern.score}점</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${scoreBg} transition-all`}
              style={{ width: `${pattern.score}%` }}
            />
          </div>
          <p className="text-xs text-zinc-600">{total}게임 분석 기반</p>
        </div>

        {/* Game list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {games.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">
              URL 있는 대표 게임이 없습니다.
            </p>
          ) : (
            <>
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                관련도 높은 대표 게임 ({games.length}개)
              </p>
              {games.map((g, i) => (
                <GameRow key={`${g.url}-${i}`} game={g} rank={i + 1} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800/60 flex items-center justify-between">
          <p className="text-xs text-zinc-600">클릭하여 분석 보드에서 게임 리뷰</p>
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-600"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
