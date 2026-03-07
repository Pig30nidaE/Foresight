"use client";

import { useState } from "react";
import type { TacticalAnalysis, TacticalPattern, ClusterInfo, XGBoostProfile, AiInsights } from "@/types";
import PatternGameListModal from "@/features/dashboard/components/modals/PatternGameListModal";

// Chess.com 게임 URL → 분석 URL 변환
function toAnalysisUrl(url: string): string {
  if (!url) return url;
  const cdotcom = url.match(/^(https?:\/\/(?:www\.)?chess\.com)\/game\/(live|daily)\/(\w+)/);
  if (cdotcom) return `${cdotcom[1]}/analysis/game/${cdotcom[2]}/${cdotcom[3]}/analysis`;
  if (/lichess\.org\/[A-Za-z0-9]+(?:\?|#|$)/.test(url)) return url.replace(/(\?.*)?$/, "#analysis");
  return url;
}

interface Props {
  data?: TacticalAnalysis;
  isLoading?: boolean;
}

// ─── 탭 설정 ────────────────────────────────────────────────
const TABS = [
  { id: "all",      label: "전체",          icon: "🗂️" },
  { id: "time",     label: "시간·심리",      icon: "⏱️" },
  { id: "position", label: "전술·포지션",    icon: "♟️" },
  { id: "opening",  label: "오프닝",         icon: "📖" },
  { id: "endgame",  label: "복잡성·엔드게임", icon: "🏁" },
] as const;

const CATEGORY_COLOR: Record<string, string> = {
  time:     "text-amber-700",
  position: "text-blue-700",
  opening:  "text-emerald-700",
  endgame:  "text-purple-700",
  balance:  "text-chess-primary",
};
const CATEGORY_BG: Record<string, string> = {
  time:     "bg-amber-700/8 border-amber-700/25",
  position: "bg-blue-700/8 border-blue-700/25",
  opening:  "bg-emerald-700/8 border-emerald-700/25",
  endgame:  "bg-purple-700/8 border-purple-700/25",
  balance:  "bg-chess-border/40 border-chess-border",
};
const CATEGORY_LABEL: Record<string, string> = {
  time:     "시간",
  position: "포지션",
  opening:  "오프닝",
  endgame:  "엔드게임",
  balance:  "밸런스",
};

// ─── AI 코치 인사이트 섹션 ──────────────────────────────────
function AiInsightsSection({ insights, isLoading }: { insights?: AiInsights | null; isLoading?: boolean }) {
  const [open, setOpen] = useState(true);
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-indigo-700/25 bg-indigo-700/6 p-5 space-y-3 animate-pulse">
        <div className="h-4 bg-indigo-700/20 rounded w-1/3" />
        <div className="h-3 bg-chess-border rounded w-full" />
        <div className="h-3 bg-chess-border rounded w-5/6" />
      </div>
    );
  }
  if (!insights) return null;
  const isGPT = insights.generated_by === "gpt-4o-mini";
  return (
    <div className="rounded-2xl border border-indigo-700/30 bg-gradient-to-br from-indigo-700/5 to-chess-bg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-indigo-700/6 transition-colors">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🤖</span>
          <div className="text-left">
            <p className="text-sm font-bold text-indigo-700 leading-none">AI 코치 분석</p>
            <p className="text-xs text-indigo-600 mt-0.5">{isGPT ? "GPT-4o-mini · 개인화 인사이트" : "규칙 기반 분석"}</p>
          </div>
        </div>
        <span className="text-chess-muted text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-700/8 border border-emerald-700/30 p-3">
              <p className="text-xs font-bold text-emerald-700 mb-1">✅ 최강 상황</p>
              <p className="text-xs text-emerald-800 leading-snug">{insights.best_situation}</p>
            </div>
            <div className="rounded-xl bg-red-600/8 border border-red-600/28 p-3">
              <p className="text-xs font-bold text-red-700 mb-1">⚠️ 취약 상황</p>
              <p className="text-xs text-red-800 leading-snug">{insights.worst_situation}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-xl border border-chess-border bg-chess-bg/80 p-3.5">
              <p className="text-xs font-semibold text-chess-muted uppercase tracking-wide mb-1">강점 분석</p>
              <p className="text-sm text-chess-primary leading-relaxed">{insights.strengths_summary}</p>
            </div>
            <div className="rounded-xl border border-chess-border bg-chess-bg/80 p-3.5">
              <p className="text-xs font-semibold text-chess-muted uppercase tracking-wide mb-1">약점 분석</p>
              <p className="text-sm text-chess-primary leading-relaxed">{insights.weaknesses_summary}</p>
            </div>
          </div>
          <div className="rounded-xl border border-amber-700/28 bg-amber-700/8 p-3.5 space-y-2">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">📚 추천 훈련</p>
            <ul className="space-y-1.5">
              {insights.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-800 leading-snug">
                  <span className="text-amber-700 shrink-0 mt-0.5">{i + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-indigo-700/28 bg-indigo-700/6 px-4 py-3 flex items-start gap-2.5">
            <span className="text-base shrink-0">🎯</span>
            <p className="text-sm text-indigo-800 leading-snug">
              <span className="font-semibold text-indigo-700">지금 집중: </span>
              {insights.training_focus}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── XGBoost 블런더 리스크 ──────────────────────────────────
function XGBoostProfileSection({ profile }: { profile: XGBoostProfile }) {
  const risk      = profile.blunder_game_rate;
  const riskColor = risk >= 35 ? "text-red-700"     : risk >= 20 ? "text-amber-700"  : "text-emerald-700";
  const riskBg    = risk >= 35 ? "bg-red-600"       : risk >= 20 ? "bg-amber-600"    : "bg-emerald-600";
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-chess-muted uppercase tracking-wider font-bold">🔴 블런더 리스크 분석</p>
        <span className="text-xs text-chess-muted">{profile.model_accuracy.toFixed(0)}% 정확도 · {profile.games_analyzed}게임</span>
      </div>
      <div className="rounded-xl border border-chess-border bg-chess-bg/80 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-chess-muted">블런더 게임 예측 비율</span>
          <span className={`text-sm font-bold ${riskColor}`}>{risk.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-chess-border/60 rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full ${riskBg}`} style={{ width: `${Math.min(risk, 100)}%` }} />
        </div>
        <p className="text-xs text-chess-muted leading-snug">{profile.description}</p>
      </div>
      <div className="space-y-1.5">
        {profile.top_risk_factors.map((f, i) => (
          <div key={f.feature} className="rounded-xl border border-chess-border bg-chess-bg/70 p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-chess-muted w-4">#{i + 1}</span>
                <span className="text-xs font-semibold text-chess-primary">{f.feature}</span>
              </div>
              <span className={`text-xs font-bold text-amber-700`}>{f.importance.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-chess-border/60 rounded-full h-1 overflow-hidden">
              <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.min(f.importance * 3, 100)}%` }} />
            </div>
            {f.description && <p className="text-xs text-chess-muted leading-snug">{f.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── K-Means 클러스터 카드 ──────────────────────────────────
function ClusterCard({ cluster }: { cluster: ClusterInfo }) {
  const border =
    cluster.is_weakness ? "border-red-600/35 bg-red-600/6" :
    cluster.is_strength ? "border-emerald-700/35 bg-emerald-700/6" :
    "border-chess-border bg-chess-bg/80";
  const wrColor = cluster.win_rate >= 55 ? "text-emerald-700" : cluster.win_rate >= 40 ? "text-amber-700" : "text-red-700";
  const wrBg    = cluster.win_rate >= 55 ? "bg-emerald-600"   : cluster.win_rate >= 40 ? "bg-amber-600"   : "bg-red-600";
  return (
    <div className={`rounded-xl border p-3.5 space-y-2 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-chess-primary leading-snug">{cluster.label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {cluster.is_weakness && <span className="text-xs text-red-700 font-bold">▼ 약점</span>}
          {cluster.is_strength && <span className="text-xs text-emerald-700 font-bold">★ 강점</span>}
          <span className={`text-sm font-bold ${wrColor}`}>{cluster.win_rate.toFixed(0)}%</span>
        </div>
      </div>
      <div className="w-full bg-chess-border/60 rounded-full h-1 overflow-hidden">
        <div className={`h-full rounded-full ${wrBg}`} style={{ width: `${cluster.win_rate}%` }} />
      </div>
      <p className="text-xs text-chess-muted">{cluster.description}</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-chess-muted">{cluster.n_games}게임</span>
        {cluster.key_traits.map((t) => (
          <span key={t} className="text-xs px-1.5 py-0.5 rounded-md bg-chess-bg text-chess-muted border border-chess-border">{t}</span>
        ))}
      </div>
    </div>
  );
}

// ─── 점수 바 ────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const color = score >= 65 ? "bg-emerald-600" : score >= 45 ? "bg-amber-600" : "bg-red-600";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-chess-border/60 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${score >= 65 ? "text-emerald-700" : score >= 45 ? "text-amber-700" : "text-red-700"}`}>{score}</span>
    </div>
  );
}

// ─── 패턴 카드 (재설계) ─────────────────────────────────────
function PatternCard({ p, highlight, onClick, isLastOdd }: { p: TacticalPattern; highlight: "strength" | "weakness" | null; onClick: () => void; isLastOdd?: boolean }) {
  const catColor = CATEGORY_COLOR[p.category] ?? "text-chess-muted";
  const catBg    = CATEGORY_BG[p.category]    ?? "bg-chess-bg border-chess-border";
  const border =
    highlight === "strength" ? "border-emerald-700/45 bg-emerald-700/6 hover:border-emerald-700/60" :
    highlight === "weakness" ? "border-red-600/40 bg-red-600/6 hover:border-red-600/55" :
    "border-chess-border bg-chess-bg/80 hover:border-chess-muted/60 hover:bg-chess-surface";

  const hasMetric = p.key_metric_value != null;
  const hasInsight = !!p.insight;
  const hasGames = (p.top_games?.length ?? 0) > 0;
  const insightBg = highlight === "strength"
    ? "bg-emerald-700/8 border-emerald-700/35 text-emerald-800"
    : highlight === "weakness"
    ? "bg-red-600/8 border-red-600/35 text-red-800"
    : "bg-blue-700/8 border-blue-700/30 text-blue-800";

  return (
    <button
      onClick={p.insufficient_data ? undefined : onClick}
      disabled={p.insufficient_data}
      className={`relative rounded-xl border p-4 text-left w-full transition-all duration-150 group space-y-3
        ${p.insufficient_data
          ? "border-chess-border/50 bg-chess-bg/40 cursor-not-allowed"
          : `cursor-pointer ${border}`
        }${isLastOdd ? " lg:col-span-2" : ""}`}
    >
      {/* 데이터 부족 오버레이 */}
      {p.insufficient_data && (
        <div className="absolute inset-0 rounded-xl z-10 flex flex-col items-center justify-center gap-2
                        bg-chess-bg/75 backdrop-blur-[2px]">
          <span className="text-xl">📊</span>
          <span className="text-xs font-bold text-chess-muted">데이터 부족</span>
          <span className="text-[10px] text-chess-muted/80 text-center px-4 leading-snug">
            더 많은 게임을 플레이하면<br />분석이 활성화됩니다
          </span>
        </div>
      )}

      {/* 헤더: icon + label + 상황번호 + 카테고리 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base leading-none">{p.icon}</span>
          <span className="text-sm font-semibold text-chess-primary truncate">{p.label}</span>
          {p.situation_id != null && p.situation_id > 0 && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-chess-bg text-chess-muted border border-chess-border font-mono shrink-0">#{p.situation_id}</span>
          )}
          {highlight === "strength" && <span className="text-xs text-emerald-700 font-bold shrink-0">★</span>}
          {highlight === "weakness" && <span className="text-xs text-red-700 font-bold shrink-0">▼</span>}
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded-md border shrink-0 ${catBg} ${catColor}`}>
          {CATEGORY_LABEL[p.category] ?? p.category}
        </span>
      </div>

      {/* BIG METRIC */}
      {hasMetric && (
        <div className="flex items-end gap-2">
          <span className={`text-3xl font-black leading-none ${
            highlight === "strength" ? "text-emerald-700" :
            highlight === "weakness" ? "text-red-700" :
            "text-chess-primary"
          }`}>
            {p.key_metric_value!.toFixed(p.key_metric_unit === "cp" ? 1 : 0)}
          </span>
          <span className="text-lg font-bold text-chess-muted leading-none pb-0.5">{p.key_metric_unit}</span>
          {p.key_metric_label && (
            <span className="text-xs text-chess-muted leading-none pb-0.5 ml-1">{p.key_metric_label}</span>
          )}
        </div>
      )}

      {/* ML 인사이트 문장 */}
      {hasInsight && (
        <div className={`rounded-lg border px-3 py-2.5 ${insightBg}`}>
          <p className="text-xs font-medium leading-snug">{p.insight}</p>
        </div>
      )}

      {/* 점수 바 */}
      <ScoreBar score={p.score} />

      {/* 우위 유지력 — 미니 스택 바 */}
      {p.chart_data?.type === "advantage_breakdown" && (
        <div className="space-y-1.5">
          <div className="w-full flex h-2 rounded-full overflow-hidden gap-px">
            <div className="bg-emerald-600 h-full" style={{ width: `${p.chart_data.maintain_rate}%` }} />
            <div className="bg-amber-600 h-full"   style={{ width: `${p.chart_data.total > 0 ? (p.chart_data.reversed_mid / p.chart_data.total) * 100 : 0}%` }} />
            <div className="bg-red-600 h-full"     style={{ width: `${p.chart_data.total > 0 ? (p.chart_data.reversed_end / p.chart_data.total) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-chess-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-600/80 inline-block" />유지 {p.chart_data.maintained}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-600/80 inline-block" />미들게임 역전 {p.chart_data.reversed_mid}{p.chart_data.mid_avg_move ? ` (avg ${p.chart_data.mid_avg_move}수)` : ""}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-600/80 inline-block" />엔드게임 역전 {p.chart_data.reversed_end}{p.chart_data.end_avg_move ? ` (avg ${p.chart_data.end_avg_move}수)` : ""}</span>
          </div>
        </div>
      )}

      {/* 분석 근거 */}
      <p className="text-xs text-chess-muted leading-snug">{p.detail}</p>

      {/* 예시 게임 / 목록 버튼 */}
      <div className="flex items-center justify-between">
        {p.example_game?.url ? (
          <div className="space-y-0.5">
            {p.example_game.hint && <p className="text-[10px] text-chess-muted leading-snug">{p.example_game.hint}</p>}
            <a
              href={toAnalysisUrl(p.example_game.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-emerald-700/80 hover:text-emerald-700 transition-colors"
            >
              <span>♟ 예시 게임</span><span>→</span>
            </a>
          </div>
        ) : <span />}
        {hasGames && (
          <span className="text-[10px] text-chess-muted group-hover:text-chess-primary transition-colors">
            {p.top_games!.length}게임 목록 →
          </span>
        )}
      </div>
    </button>
  );
}

// ─── 강점/약점 요약 바 ──────────────────────────────────────
function SummaryRow({ data, onSelect }: { data: TacticalAnalysis; onSelect: (p: TacticalPattern) => void }) {
  if (!data.strengths.length && !data.weaknesses.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-emerald-700/8 border border-emerald-700/30 p-4">
        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2.5">🏆 상위 강점</p>
        {data.strengths.map((p) => (
          <button key={p.label} onClick={() => onSelect(p)} className="flex items-center gap-1.5 py-1 w-full text-left hover:opacity-80 transition-opacity">
            <span className="text-sm">{p.icon}</span>
            <span className="text-chess-primary text-xs font-medium flex-1 truncate">{p.label}</span>
            <span className="ml-auto text-emerald-700 text-xs font-bold">{p.score}</span>
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-red-600/8 border border-red-600/30 p-4">
        <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2.5">⚠️ 개선 필요</p>
        {data.weaknesses.map((p) => (
          <button key={p.label} onClick={() => onSelect(p)} className="flex items-center gap-1.5 py-1 w-full text-left hover:opacity-80 transition-opacity">
            <span className="text-sm">{p.icon}</span>
            <span className="text-chess-primary text-xs font-medium flex-1 truncate">{p.label}</span>
            <span className="ml-auto text-red-700 text-xs font-bold">{p.score}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────
export default function TacticalPatternsCard({ data, isLoading }: Props) {
  const [selectedPattern, setSelectedPattern] = useState<TacticalPattern | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  if (isLoading || !data) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-chess-border rounded-xl" />)}
      </div>
    );
  }

  if (!data.patterns.length) {
    return <p className="text-chess-muted text-sm py-8 text-center">분석 데이터 부족 — 더 많은 게임이 필요합니다.</p>;
  }

  const strengthSet = new Set(data.strengths.map((p) => p.label));
  const weaknessSet = new Set(data.weaknesses.map((p) => p.label));

  const filteredPatterns = activeTab === "all"
    ? data.patterns
    : data.patterns.filter((p) => p.category === activeTab);

  // 탭에 패턴이 있는지 확인 (빈 탭 숨김)
  const tabCounts = Object.fromEntries(
    TABS.map((t) => [t.id, t.id === "all" ? data.patterns.length : data.patterns.filter((p) => p.category === t.id).length])
  );

  return (
    <>
      <PatternGameListModal pattern={selectedPattern} onClose={() => setSelectedPattern(null)} />
      <div className="space-y-6">

        {/* 강점/약점 요약 */}
        <SummaryRow data={data} onSelect={setSelectedPattern} />

        {/* AI 코치 */}
        <AiInsightsSection insights={(data as any).ai_insights} />

        {/* K-Means */}
        {data.cluster_analysis && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-chess-muted uppercase tracking-wider font-bold">🎲 게임 스타일 분석</p>
              <span className="text-xs text-chess-muted">전체 {data.cluster_analysis.overall_win_rate.toFixed(0)}% · {data.cluster_analysis.n_clusters}개 유형</span>
            </div>
            <p className="text-xs text-chess-muted pb-0.5">{data.cluster_analysis.summary}</p>
            <div className="space-y-2">{data.cluster_analysis.clusters.map((c) => <ClusterCard key={c.id} cluster={c} />)}</div>
          </div>
        )}

        {/* XGBoost */}
        {data.xgboost_profile && <XGBoostProfileSection profile={data.xgboost_profile} />}

        {/* 패턴 탭 + 그리드 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-chess-muted uppercase tracking-wider font-bold">📊 상세 패턴 분석</p>
            <span className="text-xs text-chess-muted">{data.patterns.length}종</span>
          </div>

          {/* 탭 바 */}
          <div className="flex gap-1.5 flex-wrap">
            {TABS.filter((t) => tabCounts[t.id] > 0).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                  activeTab === tab.id
                    ? "bg-chess-primary border-chess-primary text-white font-semibold"
                    : "bg-chess-bg border-chess-border text-chess-muted hover:border-chess-muted hover:text-chess-primary"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className={`text-[10px] ml-0.5 ${activeTab === tab.id ? "text-chess-bg/80" : "text-chess-muted"}`}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          {/* 패턴 카드 그리드 */}
          {filteredPatterns.length === 0 ? (
            <p className="text-xs text-chess-muted py-4 text-center">이 카테고리에 감지된 패턴이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {filteredPatterns.map((p, i) => (
                <PatternCard
                  key={p.label}
                  p={p}
                  highlight={strengthSet.has(p.label) ? "strength" : weaknessSet.has(p.label) ? "weakness" : null}
                  onClick={() => setSelectedPattern(p)}
                  isLastOdd={filteredPatterns.length % 2 === 1 && i === filteredPatterns.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-chess-muted text-center">
          총 {data.total_games}게임 · {data.patterns.length}종 패턴
          {data.xgboost_profile ? " · 블런더 리스크 포함" : ""}
          {data.cluster_analysis ? " · 스타일 분석 포함" : ""}
        </p>
      </div>
    </>
  );
}
