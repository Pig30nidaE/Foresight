"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getRecentGamesList } from "../api";
import type { GameSummaryItem } from "../types";
import type { Platform, TimeClass } from "@/shared/types";

// ─────────────────────────────────────────────
// PGN 파서 유틸
// ─────────────────────────────────────────────
function parsePgnHeader(pgn: string, key: string): string | null {
  const m = pgn.match(new RegExp(`\\[${key} "([^"]+)"\\]`));
  return m ? m[1] : null;
}

function getMoveCount(pgn: string): number | null {
  const m = pgn?.match(/\d+\.\s/g);
  return m ? m.length : null;
}

function getTerminationKo(pgn: string, platform: string): string | null {
  const term = parsePgnHeader(pgn, "Termination");
  if (!term) return null;
  const t = term.toLowerCase();
  if (t.includes("checkmate"))        return "체크메이트";
  if (t.includes("resignation"))      return "기권";
  if (t.includes("time"))             return "시간 초과";
  if (t.includes("stalemate"))        return "스테일메이트";
  if (t.includes("repetition"))       return "반복";
  if (t.includes("insufficient"))     return "기물 부족";
  if (t.includes("50") || t.includes("fifty")) return "50수 규칙";
  if (t.includes("agreed") || t.includes("draw")) return "합의 무승부";
  if (t.includes("abandoned"))        return "연결 끊김";
  // lichess  "Normal" 은 그냥 제외
  if (t === "normal")                 return null;
  return null;
}

function getGameLengthLabel(moves: number): string {
  if (moves < 15) return "초단기";
  if (moves < 25) return "단기";
  if (moves < 40) return "중간";
  if (moves < 60) return "장기";
  return "초장기";
}

function getTimeControl(pgn: string): string | null {
  const tc = parsePgnHeader(pgn, "TimeControl");
  if (!tc || tc === "-") return null;
  // "600+5" → "10분 +5초"
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return tc;
  const base = parseInt(m[1]);
  const inc  = m[2] ? parseInt(m[2]) : 0;
  const mins = Math.floor(base / 60);
  const secs = base % 60;
  const baseStr = mins > 0 ? `${mins}분${secs > 0 ? ` ${secs}초` : ""}` : `${secs}초`;
  return inc > 0 ? `${baseStr} +${inc}초` : baseStr;
}

// ─────────────────────────────────────────────
// 결과 배지
// ─────────────────────────────────────────────
function ResultBadge({ result, size = "md" }: { result: GameSummaryItem["result"]; size?: "sm" | "md" | "lg" }) {
  const map = {
    win:  { label: "승",  cls: "bg-emerald-600/15 text-emerald-400 border-emerald-600/40" },
    loss: { label: "패",  cls: "bg-red-600/15 text-red-400 border-red-600/40" },
    draw: { label: "무",  cls: "bg-chess-muted/20 text-chess-muted border-chess-border" },
  } as const;
  const sz = { sm: "w-6 h-6 text-xs", md: "w-7 h-7 text-xs", lg: "w-9 h-9 text-sm" };
  const { label, cls } = map[result];
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-bold border shrink-0 ${cls} ${sz[size]}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
// 게임 카드 (아코디언)
// ─────────────────────────────────────────────
function GameCard({ game, username }: { game: GameSummaryItem; username: string }) {
  const [open, setOpen] = useState(false);

  const isWhite = game.white.toLowerCase() === username.toLowerCase();
  const myColor  = isWhite ? "백" : "흑";
  const myIcon   = isWhite ? "♔" : "♚";
  const oppIcon  = isWhite ? "♚" : "♔";
  const opponent = isWhite ? game.black : game.white;

  const myRating  = isWhite ? game.rating_white  : game.rating_black;
  const oppRating = isWhite ? game.rating_black  : game.rating_white;
  const ratingDiff = (myRating != null && oppRating != null) ? myRating - oppRating : null;

  const dateStr = game.played_at
    ? new Date(game.played_at).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
    : "—";
  const timeStr = game.played_at
    ? new Date(game.played_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";

  const pgn = game.pgn ?? "";
  const moveCount  = getMoveCount(pgn);
  const termination = getTerminationKo(pgn, game.platform);
  const timeControl = getTimeControl(pgn);
  const lengthLabel = moveCount != null ? getGameLengthLabel(moveCount) : null;

  const tcIcon: Record<string, string> = { bullet: "🔫", blitz: "⚡", rapid: "⏱", classical: "🕰" };

  const resultColor = {
    win:  "text-emerald-400",
    loss: "text-red-400",
    draw: "text-chess-muted",
  }[game.result];

  const resultLabel = { win: "승리", loss: "패배", draw: "무승부" }[game.result];

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      open ? "border-chess-accent/40 bg-chess-surface" : "border-chess-border bg-chess-surface"
    }`}>
      {/* ── 헤더 ── */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-chess-border/10 transition-colors text-left"
      >
        <ResultBadge result={game.result} />

        {/* 오프닝 + 상대 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-chess-primary truncate leading-tight">
            {game.opening_name ?? game.opening_eco ?? "오프닝 정보 없음"}
          </p>
          <p className="text-xs text-chess-muted mt-0.5">
            <span className="opacity-60">{myIcon} {myColor}</span>
            <span className="mx-1.5 opacity-40">·</span>
            vs <span className="text-chess-primary/80">{opponent}</span>
            {oppRating != null && <span className="ml-1 opacity-50">({oppRating})</span>}
          </p>
        </div>

        {/* 내 레이팅 */}
        {myRating != null && (
          <span className="text-xs text-chess-muted bg-chess-bg px-2 py-0.5 rounded-full shrink-0 hidden sm:block">
            {myRating}
          </span>
        )}

        {/* 날짜 */}
        <span className="text-xs text-chess-muted shrink-0 hidden md:block">
          {dateStr}
        </span>

        {/* 타임클래스 */}
        <span className="text-xs text-chess-muted shrink-0">
          {tcIcon[game.time_class] ?? "♟"}
        </span>

        <span className={`text-chess-muted text-xs transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {/* ── 상세 패널 ── */}
      {open && (
        <div className="border-t border-chess-border">
          {/* 결과 배너 */}
          <div className={`flex items-center justify-between px-5 py-3 ${
            game.result === "win"  ? "bg-emerald-600/8" :
            game.result === "loss" ? "bg-red-600/8" :
            "bg-chess-border/20"
          }`}>
            {/* 나 */}
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-lg leading-none ${isWhite ? "text-chess-primary" : "text-chess-muted"}`}>{myIcon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-chess-accent truncate max-w-[110px]">{username}</p>
                <p className="text-xs text-chess-muted">{myColor}{myRating != null ? ` · ${myRating}` : ""}</p>
              </div>
            </div>

            {/* 결과 */}
            <div className="flex flex-col items-center shrink-0 px-3">
              <span className={`text-base font-bold ${resultColor}`}>{resultLabel}</span>
              {ratingDiff !== null && (
                <span className="text-xs text-chess-muted mt-0.5">
                  {ratingDiff > 0 ? `+${ratingDiff}` : ratingDiff} 점차
                </span>
              )}
            </div>

            {/* 상대 */}
            <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
              <span className={`text-lg leading-none ${!isWhite ? "text-chess-primary" : "text-chess-muted"}`}>{oppIcon}</span>
              <div className="min-w-0 text-right">
                <p className="text-sm font-semibold text-chess-primary truncate max-w-[110px]">{opponent}</p>
                <p className="text-xs text-chess-muted">{isWhite ? "흑" : "백"}{oppRating != null ? ` · ${oppRating}` : ""}</p>
              </div>
            </div>
          </div>

          {/* 빠른 요약 바 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 bg-chess-bg/40 border-b border-chess-border/50 text-xs text-chess-muted">
            {termination && (
              <span className="flex items-center gap-1">
                <span className="opacity-50">종료</span>
                <span className="text-chess-primary/80 font-medium">{termination}</span>
              </span>
            )}
            {moveCount != null && (
              <span className="flex items-center gap-1">
                <span className="opacity-50">수</span>
                <span className="text-chess-primary/80 font-medium">{moveCount}수</span>
                {lengthLabel && <span className="text-chess-muted/60">({lengthLabel})</span>}
              </span>
            )}
            {timeControl && (
              <span className="flex items-center gap-1">
                <span className="opacity-50">시간</span>
                <span className="text-chess-primary/80 font-medium">{timeControl}</span>
              </span>
            )}
            {game.opening_eco && (
              <span className="flex items-center gap-1">
                <span className="opacity-50">ECO</span>
                <span className="text-chess-primary/80 font-medium">{game.opening_eco}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="opacity-50">날짜</span>
              <span className="text-chess-primary/80 font-medium">{dateStr} {timeStr}</span>
            </span>
          </div>

          {/* 오프닝 이름 */}
          {game.opening_name && (
            <div className="px-5 py-2.5 border-b border-chess-border/40 bg-chess-surface/40">
              <p className="text-xs text-chess-muted mb-0.5">오프닝</p>
              <p className="text-sm text-chess-primary font-medium">{game.opening_name}</p>
            </div>
          )}

          {/* 외부 링크 */}
          {game.url && (
            <div className="px-5 pb-4">
              <a
                href={game.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-chess-accent hover:text-chess-accent/80 transition-colors"
              >
                🔗 게임 직접 보기 ({game.platform === "chess.com" ? "Chess.com" : "Lichess"})
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 스켈레톤
// ─────────────────────────────────────────────
function GameListSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-chess-surface animate-pulse border border-chess-border" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// 메인 섹션
// ─────────────────────────────────────────────
interface GameHistorySectionProps {
  username: string;
  platform: Platform;
  timeClass: TimeClass;
  sinceMs?: number;
  untilMs?: number;
}

export default function GameHistorySection({
  username, platform, timeClass, sinceMs, untilMs,
}: GameHistorySectionProps) {
  const [maxGames, setMaxGames] = useState(30);

  const { data: games, isLoading, isError, refetch } = useQuery({
    queryKey: ["games-list", platform, username, timeClass, sinceMs, untilMs, maxGames],
    queryFn: () => getRecentGamesList(platform, username, timeClass, maxGames, sinceMs, untilMs),
    enabled: !!username,
    staleTime: 60_000,
  });

  if (!username) {
    return (
      <div className="flex flex-col items-center py-24 gap-3 text-chess-muted">
        <span className="text-5xl select-none">♟️</span>
        <p className="text-sm">유저명을 입력하고 분석을 시작하세요.</p>
      </div>
    );
  }

  if (isLoading) return <GameListSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-chess-muted">
        <span className="text-4xl select-none">⚠️</span>
        <p className="text-sm">게임 데이터를 불러오는 중 오류가 발생했습니다.</p>
        <button onClick={() => refetch()} className="text-xs text-chess-accent hover:underline">
          다시 시도
        </button>
      </div>
    );
  }

  if (!games || games.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-chess-muted">
        <span className="text-4xl select-none">📭</span>
        <p className="text-sm">해당 기간에 게임이 없습니다.</p>
      </div>
    );
  }

  const wins  = games.filter(g => g.result === "win").length;
  const draws = games.filter(g => g.result === "draw").length;
  const losses = games.filter(g => g.result === "loss").length;

  return (
    <div className="space-y-4">
      {/* 결과 요약 헤더 */}
      <div className="flex items-center gap-4">
        <p className="text-sm text-chess-muted flex-1">
          총 <span className="text-chess-primary font-semibold">{games.length}</span>게임
          <span className="mx-2 opacity-30">|</span>
          <span className="text-emerald-400 font-medium">{wins}승</span>
          <span className="mx-1 opacity-40">/</span>
          <span className="text-chess-muted">{draws}무</span>
          <span className="mx-1 opacity-40">/</span>
          <span className="text-red-400 font-medium">{losses}패</span>
        </p>
        {/* 승률 바 */}
        <div className="flex h-1.5 w-32 rounded-full overflow-hidden shrink-0 bg-chess-border">
          {wins > 0  && <div style={{ width: `${wins  / games.length * 100}%` }} className="bg-emerald-500" />}
          {draws > 0 && <div style={{ width: `${draws / games.length * 100}%` }} className="bg-chess-muted/50" />}
          {losses > 0 && <div style={{ width: `${losses / games.length * 100}%` }} className="bg-red-500" />}
        </div>
      </div>

      {/* 게임 목록 */}
      <div className="space-y-2">
        {games.map((game) => (
          <GameCard key={game.game_id} game={game} username={username} />
        ))}
      </div>

      {/* 더 보기 (맨 하단) */}
      {games.length >= maxGames && (
        <button
          onClick={() => setMaxGames((p) => p + 30)}
          className="w-full py-2.5 text-xs text-chess-accent border border-chess-accent/30 rounded-xl hover:bg-chess-accent/5 transition-colors"
        >
          게임 더 보기 (+30)
        </button>
      )}
    </div>
  );
}
