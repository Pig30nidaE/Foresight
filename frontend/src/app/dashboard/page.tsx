"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getPlayerProfile } from "@/lib/api";
import type { Platform, TimeClass } from "@/types";
import { Suspense, useState, useEffect } from "react";
import GameHistorySection from "@/features/dashboard/components/GameHistorySection";
import AnalysisSection from "@/features/dashboard/components/AnalysisSection";
import { useTranslation } from "@/shared/lib/i18n";
import type { PixelGlyphComponent } from "@/shared/components/ui/PixelGlyphs";
import {
  PixelBarrierGlyph,
  PixelBoltGlyph,
  PixelBookGlyph,
  PixelBulletGlyph,
  PixelClockGlyph,
  PixelFolderGlyph,
  PixelMagnifyGlyph,
  PixelPawnGlyph,
} from "@/shared/components/ui/PixelGlyphs";
import { resolveAvatarUrl } from "@/shared/lib/avatarUrl";

const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

type TimeClassLabelKey =
  | "dh.tc.bullet"
  | "dh.tc.blitz"
  | "dh.tc.rapid"
  | "dh.tc.classical";

const TIME_CLASS_META: Record<
  TimeClass,
  { Icon: PixelGlyphComponent; key: TimeClassLabelKey }
> = {
  bullet:    { Icon: PixelBulletGlyph, key: "dh.tc.bullet" },
  blitz:     { Icon: PixelBoltGlyph, key: "dh.tc.blitz" },
  rapid:     { Icon: PixelClockGlyph, key: "dh.tc.rapid" },
  classical: { Icon: PixelBookGlyph, key: "dh.tc.classical" },
};

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

  // 모바일 필터 시트 상태 (드래프트 값: 아직 적용 전)
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftPlatform, setDraftPlatform] = useState<Platform>(initPlatform);
  const [draftTimeClass, setDraftTimeClass] = useState<TimeClass>("blitz");

  const sinceMs = undefined;
  const untilMs = undefined;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || platform === "lichess") return;
    setSubmitted(username.trim());
    setSubmittedPlatform(platform);
    router.replace(`/dashboard?platform=${platform}&username=${username.trim()}`);
  };

  const openFilter = () => {
    setDraftPlatform(platform);
    setDraftTimeClass(timeClass);
    setFilterOpen(true);
  };

  const applyFilter = () => {
    setPlatform(draftPlatform);
    setTimeClass(draftTimeClass);
    setFilterOpen(false);
  };

  useEffect(() => {
    const urlUsername = params.get("username") || "";
    if (urlUsername && urlUsername !== submitted) {
      const urlPlatform = (params.get("platform") || "chess.com") as Platform;
      setUsername(urlUsername);
      setPlatform(urlPlatform);
      setSubmitted(urlUsername);
      setSubmittedPlatform(urlPlatform);
    }
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

  useEffect(() => {
    if (profile?.preferred_time_class) {
      setTimeClass(profile.preferred_time_class as TimeClass);
    }
  }, [profile?.preferred_time_class]);

  const tcGameCount = (tc: TimeClass): number | undefined => {
    if (!profile) return undefined;
    switch (tc) {
      case "bullet":    return profile.games_bullet;
      case "blitz":     return profile.games_blitz;
      case "rapid":     return profile.games_rapid;
      case "classical": return profile.games_classical;
    }
  };

  // ── 현재 적용된 필터 칩 요약 (모바일 검색창 아래 표시)
  const SummaryTcIcon = TIME_CLASS_META[timeClass].Icon;
  const appliedFilterSummary = (
    <div className="md:hidden flex items-center gap-2 px-1 mt-2">
      <span className="text-[11px] text-chess-muted">
        {platform === "chess.com" ? "Chess.com" : "Lichess"}
      </span>
      <span className="text-chess-muted/40 text-xs">·</span>
      <span className="text-[11px] text-chess-muted inline-flex items-center gap-1">
        <SummaryTcIcon size={12} className="shrink-0 opacity-80" />
        {t(TIME_CLASS_META[timeClass].key)}
        {tcGameCount(timeClass) != null ? ` (${tcGameCount(timeClass)})` : ""}
      </span>
    </div>
  );

  return (
    <div className="relative space-y-5 sm:space-y-8">

      {/* Lichess 배너 */}
      {platform === "lichess" && (
        <div className="pixel-frame flex items-start gap-3 px-4 py-3 bg-chess-surface border-amber-600/50">
          <PixelBarrierGlyph className="shrink-0" size={22} />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-bold text-chess-primary">{t("lichess.comingSoon.title")}</p>
            <p className="text-xs text-chess-muted leading-relaxed">{t("lichess.comingSoon.desc")}</p>
          </div>
        </div>
      )}

      {/* ── Search Card ── */}
      <div className="pixel-frame pixel-hud-fill relative overflow-hidden">
        {/* 모바일: 검색 + 필터 버튼 한 줄 */}
        <div className="md:hidden flex gap-2 p-4">
          <div className="relative flex-1 min-w-0">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(e as unknown as React.FormEvent); }}
              placeholder={t("dh.searchPlaceholder")}
              className="pixel-input font-pixel w-full px-3 py-2.5 text-base text-chess-primary placeholder-chess-muted"
            />
          </div>
          {/* 필터 버튼 */}
          <button
            type="button"
            onClick={openFilter}
            className="pixel-btn flex items-center justify-center w-11 h-11 bg-chess-surface text-chess-muted hover:text-chess-primary shrink-0"
            aria-label={t("dh.aria.filter")}
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
            </svg>
          </button>
          {/* 검색 버튼 */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={platform === "lichess"}
            className="font-pixel pixel-btn px-4 py-2.5 bg-chess-inverse hover:bg-chess-inverse/90 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-semibold shrink-0"
          >
            {t("dh.startAnalysis")}
          </button>
        </div>

        {/* 현재 적용된 필터 요약 (모바일) */}
        <div className="md:hidden px-4 pb-3">
          {appliedFilterSummary}
        </div>

        {/* PC: 검색창 + 인라인 필터 */}
        <form onSubmit={handleSearch} className="hidden md:block p-5 space-y-4">
          {/* 검색 행 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("dh.searchPlaceholder")}
                className="pixel-input font-pixel w-full px-4 py-2.5 text-base text-chess-primary placeholder-chess-muted"
              />
            </div>
            <button
              type="submit"
              disabled={platform === "lichess"}
              className="font-pixel pixel-btn px-6 py-2.5 bg-chess-inverse hover:bg-chess-inverse/90 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-semibold shrink-0"
            >
              {t("dh.startAnalysis")}
            </button>
          </div>

          {/* 구분선 */}
          <div className="border-t border-chess-border/60" />

          {/* Platform */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-chess-primary/60 uppercase tracking-widest w-24 shrink-0">
              {t("dh.filter.platform")}
            </span>
            <div className="flex gap-2">
              {(["chess.com", "lichess"] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`font-pixel pixel-btn px-4 py-1.5 text-sm font-medium ${
                    platform === p
                      ? "border-chess-accent bg-chess-accent text-white dark:bg-chess-accent/25 dark:text-chess-accent"
                      : "bg-chess-elevated/25 dark:bg-transparent text-chess-muted hover:text-chess-primary"
                  }`}
                >
                  {p === "chess.com" ? "Chess.com" : "Lichess"}
                </button>
              ))}
            </div>
          </div>

          {/* Game Type */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-chess-primary/60 uppercase tracking-widest w-24 shrink-0">
              {t("dh.filter.timeClass")}
            </span>
            <div className="flex gap-2 flex-wrap">
              {TIME_CLASSES.map((tc) => {
                const count = tcGameCount(tc);
                const meta = TIME_CLASS_META[tc];
                const TcIcon = meta.Icon;
                const active = timeClass === tc;
                return (
                  <button
                    key={tc}
                    type="button"
                    onClick={() => setTimeClass(tc)}
                    className={`font-pixel pixel-btn flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium ${
                      active
                        ? "border-chess-inverse bg-chess-inverse text-white"
                        : "bg-chess-elevated/30 dark:bg-transparent text-chess-muted hover:text-chess-primary"
                    }`}
                  >
                    <TcIcon size={14} className="shrink-0 opacity-90" />
                    <span>{t(meta.key)}</span>
                    {count != null && (
                      <span className={`text-xs font-normal ${active ? "text-white/75" : "text-chess-muted/70"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </div>

      {/* ── 모바일 필터 바텀시트 ── */}
      {filterOpen && (
        <>
          {/* 백드롭 */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/55"
            onClick={() => setFilterOpen(false)}
          />
          {/* 시트 */}
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-chess-surface dark:bg-chess-elevated border-t-[3px] border-chess-border shadow-[0_-4px_0_0_color-mix(in_srgb,var(--color-chess-primary)_12%,transparent)] dark:shadow-[0_-4px_0_0_rgba(0,0,0,0.6)]">
            {/* 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 bg-chess-border border border-chess-primary/20" />
            </div>

            <div className="px-5 pb-6 pt-3 space-y-5">
              <h2 className="text-base font-bold text-chess-primary">{t("dh.filter.sheetTitle")}</h2>

              {/* Platform */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-chess-primary/60 uppercase tracking-widest">
                  {t("dh.filter.platform")}
                </p>
                <div className="flex gap-2">
                  {(["chess.com", "lichess"] as Platform[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDraftPlatform(p)}
                      className={`font-pixel pixel-btn px-4 py-2 text-sm font-medium ${
                        draftPlatform === p
                          ? "border-chess-accent bg-chess-accent text-white dark:bg-chess-accent/25 dark:text-chess-accent"
                          : "bg-chess-elevated/40 dark:bg-transparent text-chess-muted"
                      }`}
                    >
                      {p === "chess.com" ? "Chess.com" : "Lichess"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Game Type */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-chess-primary/60 uppercase tracking-widest">
                  {t("dh.filter.timeClass")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_CLASSES.map((tc) => {
                    const count = tcGameCount(tc);
                    const meta = TIME_CLASS_META[tc];
                    const TcIcon = meta.Icon;
                    const active = draftTimeClass === tc;
                    return (
                      <button
                        key={tc}
                        type="button"
                        onClick={() => setDraftTimeClass(tc)}
                        className={`font-pixel pixel-btn flex items-center gap-2 px-4 py-3 text-sm font-medium ${
                          active
                            ? "border-chess-inverse bg-chess-inverse text-white"
                            : "bg-chess-elevated/30 dark:bg-transparent text-chess-muted"
                        }`}
                      >
                        <TcIcon size={16} className="shrink-0 opacity-90" />
                        <span className="flex-1 text-left">{t(meta.key)}</span>
                        {count != null && (
                          <span className={`text-xs font-normal ${active ? "text-white/75" : "text-chess-muted/60"}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 적용 버튼 */}
              <button
                type="button"
                onClick={applyFilter}
                className="font-pixel pixel-btn w-full py-3 bg-chess-inverse text-white font-semibold text-sm hover:bg-chess-inverse/90"
              >
                {t("dh.filter.apply")}
              </button>
            </div>
          </div>
        </>
      )}

      {!submitted && (
        <div className="flex flex-col items-center py-16 sm:py-24 gap-3 text-chess-muted">
          <PixelPawnGlyph className="opacity-60" size={56} />
          <p className="text-sm">{t("dh.emptyState")}</p>
        </div>
      )}

      {submitted && (
        <>
          {profile && (
            <div className="flex items-center gap-3 sm:gap-5 px-1 animate-fade-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveAvatarUrl(profile.avatar_url)}
                alt={submitted}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-[var(--pixel-radius)] border-2 border-chess-border shrink-0 object-cover"
                style={{ imageRendering: "pixelated" }}
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold text-chess-primary truncate">{submitted}</h2>
                  <span className="font-pixel text-xs sm:text-sm text-chess-muted bg-chess-surface dark:bg-chess-elevated dark:text-chess-muted px-2 py-0.5 capitalize border-2 border-chess-border/60 dark:border-chess-border/60">
                    {submittedPlatform}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3 text-sm text-chess-muted mt-1">
                  {profile.rating_bullet != null && (
                    <span className="flex items-center gap-1">
                      <PixelBulletGlyph className="text-yellow-600 dark:text-yellow-400" size={14} />
                      <span className="hidden sm:inline text-chess-muted">Bullet</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_bullet}</span>
                    </span>
                  )}
                  {profile.rating_blitz != null && (
                    <span className="flex items-center gap-1">
                      <PixelBoltGlyph className="text-orange-500 dark:text-orange-400" size={14} />
                      <span className="hidden sm:inline text-chess-muted">Blitz</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_blitz}</span>
                    </span>
                  )}
                  {profile.rating_rapid != null && (
                    <span className="flex items-center gap-1">
                      <PixelClockGlyph className="text-blue-500 dark:text-blue-400" size={14} />
                      <span className="hidden sm:inline text-chess-muted">Rapid</span>
                      <span className="text-chess-primary font-semibold">{profile.rating_rapid}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-1 border-b border-chess-border">
            {([
              { value: "games" as const,    label: t("dh.tab.games"), Icon: PixelFolderGlyph },
              { value: "analysis" as const, label: t("dh.tab.analysis"), Icon: PixelMagnifyGlyph },
            ] as const).map((tab) => {
              const TabIc = tab.Icon;
              return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                type="button"
                className={`font-pixel inline-flex items-center gap-1.5 px-4 sm:px-5 py-2.5 text-sm font-medium -mb-px border-b-[3px] ${
                  activeTab === tab.value
                    ? "border-chess-accent text-chess-accent"
                    : "border-transparent text-chess-muted hover:text-chess-primary"
                }`}
              >
                <TabIc size={15} className="shrink-0 opacity-90" />
                {tab.label}
              </button>
            );})}
          </div>

          <section
            className={`pixel-frame bg-chess-bg/90 dark:bg-chess-elevated/12 p-3 sm:p-5 ${
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
