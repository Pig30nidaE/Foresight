"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getPlayerProfile } from "@/lib/api";
import type { Platform, TimeClass } from "@/types";
import { Suspense, useState, useEffect } from "react";
import GameHistorySection from "@/features/dashboard/components/GameHistorySection";
import AnalysisSection from "@/features/dashboard/components/AnalysisSection";
import { useTranslation } from "@/shared/lib/i18n";

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

function DashboardContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const initUsername = params.get("username") || "";
  const initPlatform = (params.get("platform") || "chess.com") as Platform;

  const [username, setUsername] = useState(initUsername);
  const [platform, setPlatform] = useState<Platform>(initPlatform);
  const [timeClass, setTimeClass] = useState<TimeClass>("blitz");
  const [submitted, setSubmitted] = useState(initUsername);
  const [submittedPlatform, setSubmittedPlatform] = useState<Platform>(initPlatform);
  const [activeTab, setActiveTab] = useState<"games" | "analysis">("games");

  const sinceMs = undefined;
  const untilMs = undefined;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setSubmitted(username.trim());
    setSubmittedPlatform(platform);
    router.replace(`/dashboard?platform=${platform}&username=${username.trim()}`);
  };

  // Navbar 등 외부에서 URL params 변경 시(같은 페이지 재탐색) submitted 동기화
  useEffect(() => {
    const urlUsername = params.get("username") || "";
    if (urlUsername && urlUsername !== submitted) {
      const urlPlatform = (params.get("platform") || "chess.com") as Platform;
      setUsername(urlUsername);
      setPlatform(urlPlatform);
      setSubmitted(urlUsername);
      setSubmittedPlatform(urlPlatform);
    }
  // params 객체 자체가 URL 변경마다 업데이트됨
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const enabled = !!submitted;

  const { data: profile } = useQuery({
    queryKey: ["profile", submittedPlatform, submitted],
    queryFn: () => getPlayerProfile(submittedPlatform, submitted),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 프로필이 로드되면 플레이어가 가장 많이 플레이한 타임클래스로 자동 전환
  useEffect(() => {
    if (profile?.preferred_time_class) {
      setTimeClass(profile.preferred_time_class as TimeClass);
    }
  }, [profile?.preferred_time_class]);

  const tcGameCount = (tc: TimeClass): number | undefined => {
    if (!profile) return undefined;
    switch (tc) {
      case "bullet": return profile.games_bullet;
      case "blitz": return profile.games_blitz;
      case "rapid": return profile.games_rapid;
      case "classical": return profile.games_classical;
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Search Bar (Section 0) ── */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap gap-3 items-center bg-chess-surface/60 border border-chess-border rounded-2xl p-5"
      >
        <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
          {(["chess.com", "lichess"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                platform === p
                  ? "bg-chess-accent text-white"
                  : "bg-chess-surface text-chess-muted hover:text-chess-primary"
              }`}
            >
              {p === "chess.com" ? "Chess.com" : "Lichess"}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-chess-border shrink-0">
          {TIME_CLASSES.map((tc) => {
            const count = tcGameCount(tc);
            return (
              <button
                key={tc}
                type="button"
                onClick={() => setTimeClass(tc)}
                className={`px-3 py-2 text-sm capitalize transition-colors ${
                  timeClass === tc
                    ? "bg-chess-primary text-white"
                    : "bg-chess-surface text-chess-muted hover:text-chess-primary"
                }`}
              >
                {tc}
                {count != null && (
                  <span className="ml-1 text-xs opacity-70">({count} {t("dh.games")})</span>
                )}
              </button>
            );
          })}
        </div>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("dh.searchPlaceholder")}
          className="flex-1 min-w-48 bg-chess-surface border border-chess-border rounded-lg px-4 py-2 text-chess-primary placeholder-chess-muted focus:outline-none focus:border-chess-accent transition-colors"
        />
        <button
          type="submit"
          className="bg-chess-accent hover:bg-chess-accent/80 text-white font-semibold px-6 py-2 rounded-lg transition-colors shrink-0"
        >
          {t("dh.startAnalysis")}
        </button>
      </form>

      {/* ── 기간 탭 ── */}
      {submitted && (
        <div className="flex flex-wrap items-center gap-2">
          {/* 게임 횟수 선택은 분석 탭으로 이동 */}
        </div>
      )}

      {!submitted && (
        <div className="flex flex-col items-center py-24 gap-3 text-chess-muted">
          <span className="text-5xl select-none">♟️</span>
          <p className="text-sm">{t("dh.emptyState")}</p>
        </div>
      )}

      {submitted && (
        <>
          {/* Profile Header */}
          {profile && (
            <div className="flex items-center gap-5 px-1 animate-fade-in">
              {profile.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={submitted}
                  className="w-16 h-16 rounded-full border-2 border-chess-border"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-chess-primary truncate">{submitted}</h2>
                  <span className="text-sm text-chess-muted bg-chess-surface px-2.5 py-1 rounded-full capitalize">
                    {submittedPlatform}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-chess-muted mt-1">
                  {profile.rating_bullet != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-yellow-500">🔫</span>
                      <span className="text-chess-muted">Bullet</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_bullet}</span>
                    </span>
                  )}
                  {profile.rating_blitz != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-orange-400">⚡</span>
                      <span className="text-chess-muted">Blitz</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_blitz}</span>
                    </span>
                  )}
                  {profile.rating_rapid != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-blue-400">⏱</span>
                      <span className="text-chess-muted">Rapid</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_rapid}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── 인페이지 탭 네비게이션 ── */}
          <div className="flex gap-1 border-b border-chess-border">
            {([
              { value: "games",     label: t("dh.tab.games") },
              { value: "analysis",  label: t("dh.tab.analysis") },
            ] as const).map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
                  activeTab === tab.value
                    ? "border-chess-accent text-chess-accent"
                    : "border-transparent text-chess-muted hover:text-chess-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 두 탭을 동시에 마운트해 탭 전환 시 React Query 캐시가 즉시 표시되도록 함 */}
          <section
            className={`bg-chess-surface border border-chess-border rounded-2xl p-6 ${
              activeTab !== "games" ? "hidden" : ""
            }`}
            aria-hidden={activeTab !== "games"}
          >
            <GameHistorySection
              username={submitted}
              platform={submittedPlatform}
              timeClass={timeClass}
              sinceMs={sinceMs}
              untilMs={untilMs}
            />
          </section>

          <div className={activeTab !== "analysis" ? "hidden" : ""} aria-hidden={activeTab !== "analysis"}>
            <AnalysisSection
              username={submitted}
              platform={submittedPlatform}
              timeClass={timeClass}
              sinceMs={sinceMs}
              untilMs={untilMs}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading Dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
