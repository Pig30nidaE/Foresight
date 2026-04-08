"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  deleteMyAnalyzedGame,
  getMeProfile,
  getMyAnalyzedGames,
  getMyComments,
  getMyPosts,
  updateMyProfile,
  uploadProfileImage,
} from "@/features/user-profile/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { useSettings, type Language, type Theme } from "@/shared/components/settings/SettingsContext";
import AvatarThumb from "@/shared/components/ui/AvatarThumb";
import { useTranslation } from "@/shared/lib/i18n";
import { formatPostDateTime } from "@/shared/lib/formatLocaleDate";
import { forumPostHref } from "@/shared/lib/forumPostHref";
import { buildGameAnalysisHrefFromDashboard } from "@/shared/lib/gameAnalysisHref";
import { userProfileHref } from "@/shared/lib/userProfileHref";
import type {
  MeProfile as Me,
  ProfileCommentItem as MyComment,
  ProfilePostItem as MyPost,
  SavedAnalyzedGameItem as MyAnalyzedGame,
} from "@/features/user-profile/types";

export default function MyPage() {
  const PAGE_SIZE = 5;
  const ANALYZED_PAGE_SIZE = 8;
  const router = useRouter();
  const { status } = useSession();
  const { t, language } = useTranslation();
  const [avatarRenderKey, setAvatarRenderKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [profilePublic, setProfilePublic] = useState(true);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [comments, setComments] = useState<MyComment[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [commentsPage, setCommentsPage] = useState(1);
  const [analyzedGames, setAnalyzedGames] = useState<MyAnalyzedGame[]>([]);
  const [analyzedTotal, setAnalyzedTotal] = useState(0);
  const [analyzedPage, setAnalyzedPage] = useState(1);
  const [analyzedSearchInput, setAnalyzedSearchInput] = useState("");
  const [analyzedSearchQuery, setAnalyzedSearchQuery] = useState("");
  const [analyzedDepthFilter, setAnalyzedDepthFilter] = useState<string>("all");
  const [analyzedLoading, setAnalyzedLoading] = useState(false);
  const [deletingAnalyzedId, setDeletingAnalyzedId] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const {
    language: settingsLanguage,
    setLanguage,
    theme,
    setTheme,
    stockfishDepth,
    setStockfishDepth,
  } = useSettings();
  const [draftLang, setDraftLang] = useState<Language>(settingsLanguage);
  const [draftTheme, setDraftTheme] = useState<Theme>(theme);
  const [draftDepth, setDraftDepth] = useState<number>(stockfishDepth);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const syncMe = (data: Me) => {
    setMe(data);
    setDisplayName(data.display_name);
    setProfilePublic(Boolean(data.profile_public));
  };

  const loadProfile = async () => {
    if (status === "unauthenticated") {
      router.replace("/api/auth/signin?callbackUrl=%2Fpost-login");
      return;
    }
    if (status === "loading") return;
    try {
      setLoading(true);
      const token = await getBackendJwt();
      if (!token) throw new Error(t("forum.error.noLoginToken"));
      const meData = await getMeProfile(token);
      setMe(meData);
      setDisplayName(meData.display_name);
      setProfilePublic(Boolean(meData.profile_public));
      setError(null);

      if (!meData.signup_completed) {
        setPosts([]);
        setComments([]);
        setPostsTotal(0);
        setCommentsTotal(0);
        setAnalyzedGames([]);
        setAnalyzedTotal(0);
        setAnalyzedPage(1);
        setAnalyzedSearchInput("");
        setAnalyzedSearchQuery("");
        setAnalyzedDepthFilter("all");
      }
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg =
        typeof d === "string" ? d : Array.isArray(d) ? d.map((x: unknown) => JSON.stringify(x)).join(" ") : e?.message;
      setError(msg ?? t("mypage.error.load"));
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    if (status !== "authenticated" || !me?.signup_completed) return;
    try {
      setActivityLoading(true);
      const token = await getBackendJwt();
      if (!token) return;
      const [postsRes, commentsRes] = await Promise.all([
        getMyPosts(token, postsPage, PAGE_SIZE),
        getMyComments(token, commentsPage, PAGE_SIZE),
      ]);
      setPosts(postsRes.items ?? []);
      setPostsTotal(postsRes.total ?? 0);
      setComments(commentsRes.items ?? []);
      setCommentsTotal(commentsRes.total ?? 0);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg =
        typeof d === "string" ? d : Array.isArray(d) ? d.map((x: unknown) => JSON.stringify(x)).join(" ") : e?.message;
      setError(msg ?? t("mypage.error.load"));
    } finally {
      setActivityLoading(false);
    }
  };

  const loadAnalyzedGames = async () => {
    if (status !== "authenticated" || !me?.signup_completed) return;
    try {
      setAnalyzedLoading(true);
      const token = await getBackendJwt();
      if (!token) return;
      const depth = analyzedDepthFilter === "all" ? undefined : Number(analyzedDepthFilter);
      const result = await getMyAnalyzedGames(
        token,
        analyzedPage,
        ANALYZED_PAGE_SIZE,
        analyzedSearchQuery,
        depth,
      );
      setAnalyzedGames(result.items ?? []);
      setAnalyzedTotal(result.total ?? 0);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg =
        typeof d === "string" ? d : Array.isArray(d) ? d.map((x: unknown) => JSON.stringify(x)).join(" ") : e?.message;
      setError(msg ?? t("mypage.error.load"));
    } finally {
      setAnalyzedLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [status]);

  useEffect(() => {
    void loadActivity();
  }, [status, me?.signup_completed, me?.id, postsPage, commentsPage]);

  useEffect(() => {
    void loadAnalyzedGames();
  }, [status, me?.signup_completed, me?.id, analyzedPage, analyzedSearchQuery, analyzedDepthFilter]);

  useEffect(() => {
    setDraftLang(settingsLanguage);
  }, [settingsLanguage]);
  useEffect(() => {
    setDraftTheme(theme);
  }, [theme]);
  useEffect(() => {
    setDraftDepth(stockfishDepth);
  }, [stockfishDepth]);

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error(t("forum.error.noLoginToken"));
      const data = await updateMyProfile(token, {
        display_name: displayName,
        profile_public: profilePublic,
      });
      syncMe(data);
      setProfilePublic(Boolean(data.profile_public));
      setError(null);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 1500);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg = typeof d === "string" ? d : e?.message ?? t("mypage.error.profileSave");
      setError(msg);
      setProfileSaved(false);
    } finally {
      setBusy(false);
    }
  };

  const patchProfileFields = async (body: Record<string, unknown>) => {
    const token = await getBackendJwt();
    if (!token) throw new Error(t("forum.error.noLoginToken"));
    const data = await updateMyProfile(token, body);
    syncMe(data);
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError(t("mypage.error.imageSize"));
      return;
    }
    setAvatarBusy(true);
    setError(null);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error(t("forum.error.noLoginToken"));
      const up = await uploadProfileImage(token, f);
      await patchProfileFields({ avatar_url: up.url });
      setAvatarRenderKey((k) => k + 1);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? t("mypage.error.upload"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onDefaultAvatar = async () => {
    setAvatarBusy(true);
    setError(null);
    try {
      await patchProfileFields({ use_site_default_avatar: true });
      setAvatarRenderKey((k) => k + 1);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? t("mypage.error.avatarChange"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRestoreOAuthAvatar = async () => {
    setAvatarBusy(true);
    setError(null);
    try {
      await patchProfileFields({ restore_oauth_avatar: true });
      setAvatarRenderKey((k) => k + 1);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? t("mypage.error.oauthAvatar"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onSaveSettings = (e: FormEvent) => {
    e.preventDefault();
    setLanguage(draftLang);
    setTheme(draftTheme);
    setStockfishDepth(draftDepth);
    setSettingsSaved(true);
    window.setTimeout(() => setSettingsSaved(false), 1500);
  };

  const onSubmitAnalyzedSearch = (e: FormEvent) => {
    e.preventDefault();
    const next = analyzedSearchInput.trim();
    setAnalyzedPage(1);
    setAnalyzedSearchQuery(next);
  };

  const onClearAnalyzedSearch = () => {
    setAnalyzedSearchInput("");
    setAnalyzedPage(1);
    setAnalyzedSearchQuery("");
    setAnalyzedDepthFilter("all");
  };

  const onDeleteAnalyzedGame = async (savedGameId: string) => {
    const ok = window.confirm(t("mypage.analyzedGameDeleteConfirm"));
    if (!ok) return;

    setDeletingAnalyzedId(savedGameId);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error(t("forum.error.noLoginToken"));
      await deleteMyAnalyzedGame(token, savedGameId);

      if (analyzedGames.length <= 1 && analyzedPage > 1) {
        setAnalyzedPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadAnalyzedGames();
      }
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg = typeof d === "string" ? d : e?.message ?? t("mypage.error.load");
      setError(msg);
    } finally {
      setDeletingAnalyzedId(null);
    }
  };

  const postsPageCount = Math.max(1, Math.ceil(postsTotal / PAGE_SIZE));
  const commentsPageCount = Math.max(1, Math.ceil(commentsTotal / PAGE_SIZE));
  const analyzedPageCount = Math.max(1, Math.ceil(analyzedTotal / ANALYZED_PAGE_SIZE));
  const postsRangeStart = postsTotal > 0 ? (postsPage - 1) * PAGE_SIZE + 1 : 0;
  const postsRangeEnd = postsTotal > 0 ? Math.min(postsPage * PAGE_SIZE, postsTotal) : 0;
  const commentsRangeStart = commentsTotal > 0 ? (commentsPage - 1) * PAGE_SIZE + 1 : 0;
  const commentsRangeEnd = commentsTotal > 0 ? Math.min(commentsPage * PAGE_SIZE, commentsTotal) : 0;
  const analyzedRangeStart = analyzedTotal > 0 ? (analyzedPage - 1) * ANALYZED_PAGE_SIZE + 1 : 0;
  const analyzedRangeEnd = analyzedTotal > 0 ? Math.min(analyzedPage * ANALYZED_PAGE_SIZE, analyzedTotal) : 0;
  const nextNicknameChangeAt = me?.display_name_change_available_at
    ? new Date(me.display_name_change_available_at)
    : null;
  const hasNicknameCooldownInfo =
    nextNicknameChangeAt !== null && !Number.isNaN(nextNicknameChangeAt.getTime());
  const nextNicknameChangeText = hasNicknameCooldownInfo
    ? nextNicknameChangeAt.toLocaleString(language === "ko" ? "ko-KR" : "en-US")
    : "";

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-pixel text-2xl md:text-3xl font-bold tracking-wide text-chess-primary pixel-glitch-title">
          {t("mypage.title")}
        </h1>
      </div>

      {loading && (
        <p className="font-pixel text-base text-chess-muted border-2 border-chess-border border-dashed px-3 py-2 w-fit">
          {t("mypage.loading")}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 pixel-frame pixel-hud-fill px-3 py-2 border-red-500/40">
          {error}
        </p>
      )}

      {me && !me.signup_completed && (
        <div className="pixel-frame pixel-hud-fill p-4 text-chess-primary">
          <p className="text-sm leading-relaxed">{t("mypage.incompleteHint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/signup/consent"
              className="font-pixel inline-flex items-center px-3 py-2 text-xs font-semibold text-white bg-chess-accent pixel-btn"
            >
              {t("mypage.cta.consent")}
            </Link>
            <Link
              href="/signup"
              className="font-pixel inline-flex items-center px-3 py-2 text-xs font-medium text-chess-primary pixel-btn bg-chess-surface/80"
            >
              {t("mypage.cta.nickname")}
            </Link>
          </div>
        </div>
      )}

      {me && me.signup_completed && (
        <>
          <form onSubmit={onSaveSettings} className="space-y-3 pixel-frame pixel-hud-fill p-4 sm:p-5">
            <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">{t("mypage.appSettings")}</h2>
            <p className="text-sm text-chess-muted">{t("mypage.appSettingsHint")}</p>
            <div>
              <label className="block text-sm font-medium text-chess-primary">{t("mypage.label.language")}</label>
              <select
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
                value={draftLang}
                onChange={(e) => setDraftLang(e.target.value as Language)}
              >
                <option value="ko">{t("mypage.lang.ko")}</option>
                <option value="en">{t("mypage.lang.en")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-chess-primary">{t("mypage.label.theme")}</label>
              <select
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
                value={draftTheme}
                onChange={(e) => setDraftTheme(e.target.value as Theme)}
              >
                <option value="light">{t("mypage.theme.light")}</option>
                <option value="dark">{t("mypage.theme.dark")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-chess-primary">{t("settings.depth")}</label>
              <select
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
                value={draftDepth}
                onChange={(e) => setDraftDepth(Number(e.target.value))}
              >
                {[12, 18, 24].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="font-pixel px-4 py-2 text-xs font-semibold text-white bg-chess-accent pixel-btn"
              >
                {t("mypage.saveSettings")}
              </button>
              {settingsSaved && (
                <span className="font-pixel text-sm text-chess-win tabular-nums">{t("mypage.flash.settingsSaved")}</span>
              )}
            </div>
          </form>

          <form onSubmit={onSaveProfile} className="space-y-3 pixel-frame pixel-hud-fill p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">{t("mypage.profileSection")}</h2>
              {me.public_id && (
                <Link
                  href={userProfileHref(me)}
                  className={`font-pixel text-sm font-medium underline decoration-2 underline-offset-2 hover:brightness-110 ${
                    me.profile_public ? "text-chess-accent" : "text-chess-muted"
                  }`}
                >
                  {t("mypage.viewPublicProfile")}
                </Link>
              )}
            </div>
            <p className="text-sm leading-relaxed text-chess-muted">
              {t("mypage.email")}{" "}
              <span className="font-sans tracking-normal [overflow-wrap:anywhere]">{me.email ?? "-"}</span>
            </p>

            <div>
              <p className="text-sm font-medium text-chess-primary">{t("profile.photo")}</p>
              <div className="mt-2 flex flex-wrap items-start gap-4">
                <AvatarThumb key={avatarRenderKey} src={me.avatar_url} alt="" size={64} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm leading-relaxed text-chess-muted">{t("profile.photoHint")}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={onAvatarFile}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={avatarBusy || busy}
                      onClick={() => fileInputRef.current?.click()}
                      className="font-pixel px-3 py-1.5 text-sm font-semibold text-chess-primary pixel-btn bg-chess-surface/80 disabled:opacity-50"
                    >
                      {t("profile.chooseImage")}
                    </button>
                    <button
                      type="button"
                      disabled={avatarBusy || busy}
                      onClick={() => void onDefaultAvatar()}
                      className="font-pixel px-3 py-1.5 text-sm font-medium text-chess-primary pixel-btn bg-chess-border/25 disabled:opacity-50"
                    >
                      {t("profile.useDefaultImage")}
                    </button>
                    <button
                      type="button"
                      disabled={avatarBusy || busy}
                      onClick={() => void onRestoreOAuthAvatar()}
                      className="font-pixel px-3 py-1.5 text-sm font-medium text-chess-primary pixel-btn bg-chess-border/25 disabled:opacity-50"
                    >
                      {t("profile.restoreOAuthPhoto")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-chess-primary">{t("mypage.label.nickname")}</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
              />
              {hasNicknameCooldownInfo && (
                <p className="mt-1 text-xs text-chess-muted">
                  {t("mypage.nicknameCooldownHint").replace("{at}", nextNicknameChangeText)}
                </p>
              )}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-chess-primary">
              <input
                type="checkbox"
                checked={profilePublic}
                onChange={(e) => setProfilePublic(e.target.checked)}
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-chess-accent border-chess-border"
              />
              <span>{t("mypage.profilePublic")}</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="font-pixel px-4 py-2 text-xs font-semibold text-white bg-chess-accent pixel-btn disabled:opacity-50"
              >
                {busy ? t("mypage.saving") : t("mypage.save")}
              </button>
              {profileSaved && (
                <span className="font-pixel text-sm text-chess-win tabular-nums">{t("mypage.flash.profileSaved")}</span>
              )}
            </div>
          </form>

          <section
            className={`pixel-frame pixel-hud-fill p-4 sm:p-5 ${activityLoading ? "opacity-70" : ""}`}
            aria-busy={activityLoading}
          >
            <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">{t("mypage.myPosts")}</h2>
            <div className="mt-3 space-y-2">
              {postsTotal === 0 ? (
                <p className="text-sm text-chess-muted border-2 border-dashed border-chess-border/70 px-3 py-6 text-center">
                  {t("mypage.noPosts")}
                </p>
              ) : (
                posts.map((p) => (
                  <article key={p.id} className="min-w-0 max-w-full pixel-frame pixel-hud-fill p-3">
                    <Link
                      href={forumPostHref(p)}
                      className="block min-w-0 max-w-full font-pixel text-sm font-bold text-chess-primary no-underline hover:text-chess-accent"
                    >
                      <span className="line-clamp-2 w-full min-w-0 max-w-full break-all [overflow-wrap:anywhere] [word-break:break-word]">
                        {p.title}
                      </span>
                    </Link>
                    <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm text-chess-muted [overflow-wrap:anywhere]">
                      {p.body_preview}
                    </p>
                    <p className="mt-1 font-pixel text-xs tabular-nums text-chess-muted">
                      {formatPostDateTime(p.created_at, language)}
                    </p>
                  </article>
                ))
              )}
            </div>
            {postsPageCount > 1 && (
              <div className="mt-3 space-y-2">
                <p className="text-center text-xs text-chess-muted tabular-nums sm:text-sm">
                  {t("forum.pagination.showing")
                    .replace("{start}", String(postsRangeStart))
                    .replace("{end}", String(postsRangeEnd))
                    .replace("{total}", String(postsTotal))}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPostsPage((prev) => Math.max(1, prev - 1))}
                    disabled={postsPage === 1 || activityLoading}
                    className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("forum.pagination.prev")}
                  </button>
                  <span className="font-pixel text-xs text-chess-muted tabular-nums">
                    {postsPage} / {postsPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPostsPage((prev) => Math.min(postsPageCount, prev + 1))}
                    disabled={postsPage === postsPageCount || activityLoading}
                    className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("forum.pagination.next")}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section
            className={`pixel-frame pixel-hud-fill p-4 sm:p-5 ${activityLoading ? "opacity-70" : ""}`}
            aria-busy={activityLoading}
          >
            <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">{t("mypage.myComments")}</h2>
            <div className="mt-3 space-y-2">
              {commentsTotal === 0 ? (
                <p className="text-sm text-chess-muted border-2 border-dashed border-chess-border/70 px-3 py-6 text-center">
                  {t("mypage.noComments")}
                </p>
              ) : (
                comments.map((c) => (
                  <article key={c.id} className="pixel-frame pixel-hud-fill p-3">
                    <Link
                      href={forumPostHref({
                        public_id: c.post_public_id,
                        id: c.post_id,
                        board_category: c.post_board_category,
                      })}
                      className="font-pixel text-xs font-bold text-chess-accent hover:brightness-110 [overflow-wrap:anywhere]"
                    >
                      {c.post_title}
                    </Link>
                    <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm text-chess-primary [overflow-wrap:anywhere]">
                      {c.body}
                    </p>
                    <p className="mt-1 font-pixel text-xs tabular-nums text-chess-muted">
                      {formatPostDateTime(c.created_at, language)}
                    </p>
                  </article>
                ))
              )}
            </div>
            {commentsPageCount > 1 && (
              <div className="mt-3 space-y-2">
                <p className="text-center text-xs text-chess-muted tabular-nums sm:text-sm">
                  {t("forum.pagination.showing")
                    .replace("{start}", String(commentsRangeStart))
                    .replace("{end}", String(commentsRangeEnd))
                    .replace("{total}", String(commentsTotal))}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCommentsPage((prev) => Math.max(1, prev - 1))}
                    disabled={commentsPage === 1 || activityLoading}
                    className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("forum.pagination.prev")}
                  </button>
                  <span className="font-pixel text-xs text-chess-muted tabular-nums">
                    {commentsPage} / {commentsPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCommentsPage((prev) => Math.min(commentsPageCount, prev + 1))}
                    disabled={commentsPage === commentsPageCount || activityLoading}
                    className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("forum.pagination.next")}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section
            className={`pixel-frame pixel-hud-fill p-4 sm:p-5 ${analyzedLoading ? "opacity-70" : ""}`}
            aria-busy={analyzedLoading}
          >
            <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">
              {t("mypage.myAnalyzedGames")}
            </h2>
            <p className="mt-1 text-xs text-chess-muted">{t("mypage.analyzedGamesHint")}</p>
            <p className="mt-1 text-xs text-chess-muted">{t("mypage.analyzedGameSearchHint")}</p>

            <form onSubmit={onSubmitAnalyzedSearch} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={analyzedSearchInput}
                onChange={(e) => setAnalyzedSearchInput(e.target.value)}
                placeholder={t("mypage.analyzedGameSearchPlaceholder")}
                className="w-full min-w-0 flex-1 px-3 py-2 text-sm text-chess-primary pixel-input"
              />
              <select
                value={analyzedDepthFilter}
                onChange={(e) => {
                  setAnalyzedPage(1);
                  setAnalyzedDepthFilter(e.target.value);
                }}
                aria-label={t("mypage.analyzedGameDepthFilter")}
                className="w-full sm:w-36 px-3 py-2 text-sm text-chess-primary pixel-input"
              >
                <option value="all">{t("mypage.analyzedGameDepthAll")}</option>
                {[12, 18, 24].map((depth) => (
                  <option key={depth} value={String(depth)}>
                    D{depth}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={analyzedLoading}
                  className="font-pixel px-3 py-2 text-xs font-semibold text-white bg-chess-accent pixel-btn disabled:opacity-50"
                >
                  {t("mypage.analyzedGameSearch")}
                </button>
                <button
                  type="button"
                  onClick={onClearAnalyzedSearch}
                  disabled={analyzedLoading}
                  className="font-pixel px-3 py-2 text-xs font-medium text-chess-primary pixel-btn bg-chess-surface/80 disabled:opacity-50"
                >
                  {t("mypage.analyzedGameSearchClear")}
                </button>
              </div>
            </form>

            <div className="mt-3 space-y-2">
              {analyzedGames.length === 0 ? (
                <p className="text-sm text-chess-muted border-2 border-dashed border-chess-border/70 px-3 py-6 text-center">
                  {analyzedSearchQuery ? t("mypage.noAnalyzedGamesBySearch") : t("mypage.noAnalyzedGames")}
                </p>
              ) : (
                analyzedGames.map((item) => {
                  const href = buildGameAnalysisHrefFromDashboard(item.dashboard_href, item.game_id);
                  const deleting = deletingAnalyzedId === item.id;

                  return (
                    <article key={item.id} className="pixel-frame pixel-hud-fill p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block min-w-0 max-w-full font-pixel text-sm font-bold text-chess-primary no-underline hover:text-chess-accent"
                        >
                          <span className="line-clamp-2 w-full min-w-0 max-w-full break-all [overflow-wrap:anywhere] [word-break:break-word]">
                            {item.label}
                          </span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => void onDeleteAnalyzedGame(item.id)}
                          disabled={deleting || analyzedLoading}
                          className="font-pixel shrink-0 px-2 py-1 text-[11px] text-red-600 pixel-btn bg-red-500/10 disabled:opacity-50"
                        >
                          {deleting ? t("mypage.analyzedGameDeleting") : t("mypage.analyzedGameDelete")}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-chess-muted tabular-nums">
                        {t("mypage.analyzedGameDepth").replace("{depth}", String(item.depth))}
                      </p>
                      <p className="mt-1 text-xs text-chess-muted tabular-nums">
                        {formatPostDateTime(item.analyzed_at, language)}
                      </p>
                    </article>
                  );
                })
              )}
            </div>

            {analyzedPageCount > 1 && (
              <div className="mt-3 space-y-2">
                <p className="text-center text-xs text-chess-muted tabular-nums sm:text-sm">
                  {t("forum.pagination.showing")
                    .replace("{start}", String(analyzedRangeStart))
                    .replace("{end}", String(analyzedRangeEnd))
                    .replace("{total}", String(analyzedTotal))}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnalyzedPage((prev) => Math.max(1, prev - 1))}
                    disabled={analyzedPage === 1 || analyzedLoading}
                    className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("forum.pagination.prev")}
                  </button>
                  <span className="font-pixel text-xs text-chess-muted tabular-nums">
                    {analyzedPage} / {analyzedPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAnalyzedPage((prev) => Math.min(analyzedPageCount, prev + 1))}
                    disabled={analyzedPage === analyzedPageCount || analyzedLoading}
                    className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("forum.pagination.next")}
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <Link
              href="/mypage/withdraw"
              className="text-xs text-chess-muted underline decoration-dotted underline-offset-4 hover:text-red-500"
            >
              {t("mypage.withdraw.openSurvey")}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
