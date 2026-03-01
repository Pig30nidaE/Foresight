"use client";

import { useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOpponentAnalysis } from "@/lib/api";
import type {
  Platform,
  TimeClass,
  OpponentAnalysis,
  OpponentEcoGroupStats,
  OpponentPhaseData,
  PrepAdvice,
  StyleCluster,
  LGBMBlunderTrigger,
} from "@/types";

// ─────────── 유틸 ───────────

function scoreColor(score: number | null) {
  if (score == null) return "bg-zinc-700";
  if (score >= 70) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-red-500";
}

function cpLossColor(loss: number | null) {
  if (loss == null) return "text-zinc-500";
  if (loss < 30) return "text-emerald-400";
  if (loss < 60) return "text-amber-400";
  return "text-red-400";
}

function confidenceBadge(c: PrepAdvice["confidence"]) {
  switch (c) {
    case "high": return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40";
    case "medium": return "bg-amber-500/20 text-amber-400 border border-amber-500/40";
    case "low": return "bg-zinc-700/60 text-zinc-400 border border-zinc-600";
  }
}

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    opening: "bg-violet-500/20 text-violet-300",
    time_management: "bg-sky-500/20 text-sky-300",
    middlegame: "bg-amber-500/20 text-amber-300",
    endgame: "bg-rose-500/20 text-rose-300",
    style: "bg-emerald-500/20 text-emerald-300",
    tactics: "bg-orange-500/20 text-orange-300",
  };
  return map[cat] ?? "bg-zinc-700/60 text-zinc-300";
}

const categoryLabel: Record<string, string> = {
  opening: "오프닝",
  time_management: "시간 관리",
  middlegame: "미들게임",
  endgame: "엔드게임",
  style: "스타일",
  tactics: "전술",
};

const ecoGroupName: Record<string, string> = {
  A: "A (플랭크 오프닝)",
  B: "B (반-오픈 게임)",
  C: "C (오픈 게임)",
  D: "D (클로즈드 게임)",
  E: "E (인도 디펜스)",
};

// ─────────── 서브 컴포넌트 ───────────

function ScoreBar({ score, label }: { score: number | null; label: string }) {
  const pct = score ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={score == null ? "text-zinc-600" : "text-white font-medium"}>
          {score == null ? "—" : `${Math.round(score)}`}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreColor(score)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function PhaseCard({
  phase,
  data,
  isWeakest,
}: {
  phase: string;
  data?: OpponentPhaseData;
  isWeakest: boolean;
}) {
  const label = phase === "opening" ? "오프닝" : phase === "middlegame" ? "미들게임" : "엔드게임";
  return (
    <div
      className={`rounded-xl p-4 border ${
        isWeakest
          ? "border-red-500/50 bg-red-500/5"
          : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-white">{label}</span>
        {isWeakest && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">
            약점
          </span>
        )}
      </div>
      {data ? (
        <>
          <div className={`text-2xl font-bold mb-1 ${cpLossColor(data.avg_cp_loss)}`}>
            {data.avg_cp_loss != null ? `−${data.avg_cp_loss.toFixed(0)} cp` : "—"}
          </div>
          <p className="text-xs text-zinc-500 mb-3">{data.n}게임 기준</p>
          <ScoreBar score={data.score} label="품질 점수 (100 = 최상)" />
        </>
      ) : (
        <p className="text-xs text-zinc-600 mt-2">데이터 없음</p>
      )}
    </div>
  );
}

function EcoTable({
  title,
  rows,
  weakest,
}: {
  title: string;
  rows: OpponentEcoGroupStats[];
  weakest: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <span className="text-sm font-semibold text-white">{title}</span>
        {weakest && (
          <span className="text-xs text-zinc-500">
            가장 약한 오프닝군:{" "}
            <span className="text-red-400 font-medium">{weakest}</span>
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
            <th className="text-left px-4 py-2">그룹</th>
            <th className="text-right px-4 py-2">게임</th>
            <th className="text-right px-4 py-2">승률</th>
            <th className="text-right px-4 py-2">오프닝 손실</th>
            <th className="text-left px-4 py-2 hidden sm:table-cell">대표 오프닝</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.eco_group}
              className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${
                r.eco_group === weakest ? "bg-red-500/5" : ""
              }`}
            >
              <td className="px-4 py-2">
                <span className="font-bold text-emerald-400 mr-2">{r.eco_group}</span>
                <span className="text-zinc-400 text-xs hidden sm:inline">
                  {ecoGroupName[r.eco_group] ?? ""}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-zinc-400">{r.games}</td>
              <td
                className={`px-4 py-2 text-right font-semibold ${
                  r.win_rate >= 55
                    ? "text-emerald-400"
                    : r.win_rate >= 45
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {r.win_rate.toFixed(0)}%
              </td>
              <td className={`px-4 py-2 text-right ${cpLossColor(r.avg_opening_cp_loss)}`}>
                {r.avg_opening_cp_loss != null
                  ? `−${r.avg_opening_cp_loss.toFixed(0)}`
                  : "—"}
              </td>
              <td className="px-4 py-2 text-zinc-400 text-xs hidden sm:table-cell truncate max-w-[160px]">
                {r.top_opening}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrepAdviceCard({ advice, rank }: { advice: PrepAdvice; rank: number }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="text-zinc-600 font-bold text-lg w-6 shrink-0 mt-0.5">#{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(
                advice.category
              )}`}
            >
              {categoryLabel[advice.category] ?? advice.category}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${confidenceBadge(
                advice.confidence
              )}`}
            >
              신뢰도 {advice.confidence === "high" ? "높음" : advice.confidence === "medium" ? "중간" : "낮음"}
            </span>
          </div>
          <h3 className="text-white font-semibold text-sm mb-1">{advice.title}</h3>
          <p className="text-zinc-400 text-sm leading-relaxed mb-2">{advice.detail}</p>
          <p className="text-zinc-600 text-xs italic">{advice.evidence}</p>
        </div>
      </div>
    </div>
  );
}

function BlunderTriggerRow({ t }: { t: LGBMBlunderTrigger }) {
  const barPct = Math.min((t.impact / 20) * 100, 100);
  return (
    <div className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
      <div className="w-28 shrink-0">
        <div className="text-xs text-zinc-300 font-medium truncate">{t.feature}</div>
        <div className="h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
      <div className="text-amber-400 text-sm font-bold w-12 shrink-0">
        +{t.impact.toFixed(1)}
      </div>
      <p className="text-zinc-400 text-xs flex-1">{t.description}</p>
    </div>
  );
}

function ClusterBadge({ c }: { c: StyleCluster }) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        c.is_weakness
          ? "border-red-500/40 bg-red-500/5"
          : "border-zinc-800 bg-zinc-900/50"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-white">{c.label}</span>
        {c.is_weakness && (
          <span className="text-xs text-red-400">⚠ 약점 패턴</span>
        )}
      </div>
      <div className="text-xs text-zinc-500">
        {c.n_games}게임 · 승률{" "}
        <span
          className={
            c.win_rate >= 55
              ? "text-emerald-400"
              : c.win_rate >= 45
              ? "text-amber-400"
              : "text-red-400"
          }
        >
          {c.win_rate.toFixed(0)}%
        </span>
        {c.avg_cp_loss != null && (
          <> · 손실 <span className={cpLossColor(c.avg_cp_loss)}>{c.avg_cp_loss.toFixed(0)} cp</span></>
        )}
      </div>
    </div>
  );
}

// ─────────── 메인 섹션 렌더러 ───────────

function AnalysisResult({ data, username }: { data: OpponentAnalysis; username: string }) {
  const pw = data.phase_weakness;
  const sp = data.style_profile;
  const lgbm = data.ml_insights.lgbm;
  const clusters = data.ml_insights.style_clusters;

  return (
    <div className="space-y-6">
      {/* ── 요약 헤더 ── */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-white">{username}</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-sm border border-violet-500/30 font-medium">
                {data.summary.style_tag}
              </span>
            </div>
            <p className="text-zinc-300 text-sm">{data.summary.key_insight}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center shrink-0">
            <div className="bg-zinc-800/60 rounded-lg px-4 py-2">
              <div className="text-2xl font-bold text-white">{data.total_games}</div>
              <div className="text-xs text-zinc-500">전체 게임</div>
            </div>
            <div className="bg-zinc-800/60 rounded-lg px-4 py-2">
              <div
                className={`text-2xl font-bold ${
                  data.win_rate >= 55
                    ? "text-emerald-400"
                    : data.win_rate >= 45
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {data.win_rate.toFixed(0)}%
              </div>
              <div className="text-xs text-zinc-500">승률</div>
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-zinc-600">
          <span>분석 게임: {data.summary.games_analyzed}개</span>
          <span>Stockfish 분석: {data.summary.sf_games_analyzed}게임</span>
        </div>
      </div>

      {/* ── 준비 조언 ── */}
      {data.preparation_advice.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <span className="text-amber-400">⚡</span> 대회 준비 전략
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.preparation_advice.map((adv, i) => (
              <PrepAdviceCard key={i} advice={adv} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* ── 페이즈 약점 ── */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-red-400">📊</span> 페이즈별 수 품질
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PhaseCard
            phase="opening"
            data={pw.opening}
            isWeakest={pw.weakest_phase === "opening"}
          />
          <PhaseCard
            phase="middlegame"
            data={pw.middlegame}
            isWeakest={pw.weakest_phase === "middlegame"}
          />
          <PhaseCard
            phase="endgame"
            data={pw.endgame}
            isWeakest={pw.weakest_phase === "endgame"}
          />
        </div>
      </div>

      {/* ── 오프닝 프로파일 ── */}
      {(data.opening_profile.white_tree.length > 0 ||
        data.opening_profile.black_tree.length > 0) && (
        <div>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <span className="text-emerald-400">♟</span> 오프닝 프로파일
          </h2>
          <div className="space-y-4">
            <EcoTable
              title="백 오프닝"
              rows={data.opening_profile.white_tree}
              weakest={data.opening_profile.weakest_as_white}
            />
            <EcoTable
              title="흑 오프닝"
              rows={data.opening_profile.black_tree}
              weakest={data.opening_profile.weakest_as_black}
            />
          </div>
        </div>
      )}

      {/* ── 스타일 프로파일 ── */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-sky-400">🎯</span> 플레이 스타일
        </h2>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <ScoreBar score={sp.tactical_score} label="전술 선호도 (100 = 복잡한 전술)" />
            <ScoreBar score={sp.time_management_score} label="시간 관리 (100 = 최고)" />
            <ScoreBar score={sp.opening_preparation_score} label="오프닝 준비도" />
            <div className="space-y-1">
              <div className="text-xs text-zinc-400">복잡도 선호</div>
              <div className="text-sm font-medium text-white capitalize">{sp.complexity_preference}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-800">
            {[
              { label: "게임 길이 경향", value: sp.game_length_tendency },
              { label: "클락 압박 임계", value: `${sp.clock_pressure_threshold.toFixed(0)}초` },
              { label: "퀸 교환율", value: `${(sp.queen_exchange_rate * 100).toFixed(0)}%` },
              { label: "상대방 캐슬링 비율", value: `${(sp.opposite_castling_rate * 100).toFixed(0)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-800/40 rounded-lg p-3 text-center">
                <div className="text-white font-semibold text-sm">{value}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ML 인사이트 ── */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-violet-400">🤖</span> ML 분석 인사이트
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* LightGBM 블런더 트리거 */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">블런더 유발 요인</h3>
              {lgbm.available && lgbm.cv_mae != null && (
                <span className="text-xs text-zinc-500">MAE {lgbm.cv_mae.toFixed(1)} cp</span>
              )}
            </div>
            {lgbm.available && lgbm.blunder_triggers && lgbm.blunder_triggers.length > 0 ? (
              <div>
                {lgbm.blunder_triggers.map((t, i) => (
                  <BlunderTriggerRow key={i} t={t} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic">
                {lgbm.reason ?? "데이터 부족으로 LightGBM 분석 불가"}
              </p>
            )}
          </div>

          {/* K-Means 스타일 클러스터 */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              게임 패턴 군집
              {clusters && (
                <span className="text-zinc-500 font-normal text-xs ml-2">
                  {clusters.n_clusters}개 그룹
                </span>
              )}
            </h3>
            {clusters && clusters.clusters.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {clusters.clusters.map((c) => (
                  <ClusterBadge key={c.id} c={c} />
                ))}
                {clusters.worst_cluster && (
                  <p className="text-xs text-zinc-600 mt-1 italic">
                    가장 약한 패턴: {clusters.worst_cluster}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic">데이터 부족으로 클러스터 분석 불가</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── 페이지 ───────────

function OpponentContent() {
  const [platform, setPlatform] = useState<Platform>("chess.com");
  const [username, setUsername] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [timeClass, setTimeClass] = useState<TimeClass>("blitz");

  const { data, isLoading, error } = useQuery({
    queryKey: ["opponent", platform, submitted, timeClass],
    queryFn: () => getOpponentAnalysis(platform, submitted, timeClass),
    enabled: !!submitted,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) setSubmitted(username.trim());
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">🎯 상대 분석</h1>
        <p className="text-zinc-400 text-sm">
          대회 상대의 유저명을 입력하면 오프닝 패턴, 페이즈 약점, ML 기반 준비 전략을 제공합니다.
        </p>
      </div>

      {/* 검색 폼 */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex rounded-lg overflow-hidden border border-zinc-700 shrink-0">
          {(["chess.com", "lichess"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                platform === p
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {p === "chess.com" ? "Chess.com" : "Lichess"}
            </button>
          ))}
        </div>
        <select
          value={timeClass}
          onChange={(e) => setTimeClass(e.target.value as TimeClass)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 text-sm"
        >
          <option value="blitz">Blitz</option>
          <option value="rapid">Rapid</option>
          <option value="bullet">Bullet</option>
        </select>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="상대 유저명"
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 text-white font-semibold px-5 py-2 rounded-lg transition-colors shrink-0"
        >
          {isLoading ? "분석 중..." : "분석"}
        </button>
      </form>

      {/* 로딩 */}
      {isLoading && (
        <div className="text-center py-16 space-y-3">
          <div className="text-zinc-400 animate-pulse text-base">
            Stockfish + LightGBM 분석 중입니다...
          </div>
          <p className="text-zinc-600 text-sm">최대 60초가 소요될 수 있습니다.</p>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm font-medium">분석 실패</p>
          <p className="text-red-300/70 text-xs mt-1">
            유저명을 확인하거나 잠시 후 다시 시도해주세요.
          </p>
        </div>
      )}

      {/* 결과 */}
      {data && !isLoading && (
        <AnalysisResult data={data} username={submitted} />
      )}
    </div>
  );
}

export default function OpponentPage() {
  return (
    <Suspense>
      <OpponentContent />
    </Suspense>
  );
}

