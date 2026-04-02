"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, FileText, MessageCircle } from "lucide-react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { DEFAULT_AVATAR_PATH, resolveAvatarUrl } from "@/shared/lib/avatarUrl";
import { useTranslation } from "@/shared/lib/i18n";
import { formatPostDateTime } from "@/shared/lib/formatLocaleDate";
import { forumPostHref } from "@/shared/lib/forumPostHref";

type PublicPost = {
  id: string;
  public_id: string;
  title: string;
  body_preview: string;
  created_at: string;
  board_category?: string | null;
};

type PublicComment = {
  id: string;
  body: string;
  created_at: string;
  post_id: string;
  post_public_id: string;
  post_title: string;
  post_board_category?: string | null;
};

type UserPublicProfile = {
  id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  profile_public: boolean;
  activity_visible: boolean;
  posts: PublicPost[];
  comments: PublicComment[];
  posts_total: number;
  comments_total: number;
};

export default function PublicUserProfileView() {
  const PAGE_SIZE = 5;
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params?.userId;
  const { t, language } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [postsPage, setPostsPage] = useState(1);
  const [commentsPage, setCommentsPage] = useState(1);
  const isFirstProfileFetch = useRef(true);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
        if (isFirstProfileFetch.current) setLoading(true);
        else setListRefreshing(true);
        const token = await getBackendJwt();
        const { data } = await api.get<UserPublicProfile>(`/users/${userId}`, {
          params: {
            posts_page: postsPage,
            posts_page_size: PAGE_SIZE,
            comments_page: commentsPage,
            comments_page_size: PAGE_SIZE,
          },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setProfile(data);
        setError(null);
        isFirstProfileFetch.current = false;
      } catch (e: unknown) {
        const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(typeof d === "string" ? d : t("profilePublic.error.load"));
      } finally {
        setLoading(false);
        setListRefreshing(false);
      }
    };
    void load();
  }, [userId, postsPage, commentsPage]);

  useEffect(() => {
    setPostsPage(1);
    setCommentsPage(1);
  }, [tab]);

  const posts = profile?.posts ?? [];
  const comments = profile?.comments ?? [];
  const postsTotal = profile?.posts_total ?? 0;
  const commentsTotal = profile?.comments_total ?? 0;
  const postsPageCount = Math.max(1, Math.ceil(postsTotal / PAGE_SIZE));
  const commentsPageCount = Math.max(1, Math.ceil(commentsTotal / PAGE_SIZE));
  const postsRangeStart = postsTotal > 0 ? (postsPage - 1) * PAGE_SIZE + 1 : 0;
  const postsRangeEnd = postsTotal > 0 ? Math.min(postsPage * PAGE_SIZE, postsTotal) : 0;
  const commentsRangeStart = commentsTotal > 0 ? (commentsPage - 1) * PAGE_SIZE + 1 : 0;
  const commentsRangeEnd = commentsTotal > 0 ? Math.min(commentsPage * PAGE_SIZE, commentsTotal) : 0;

  return (
    <div className="min-h-[60vh] pb-16">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }
              router.push("/forum");
            }}
            className="pixel-btn px-3 py-1.5 font-pixel text-xs text-chess-primary"
          >
            {t("profilePublic.back")}
          </button>
        </div>
        <nav className="mb-6 flex flex-wrap items-center gap-1 font-pixel text-xs text-chess-muted sm:text-sm">
          <Link href="/" className="pixel-btn px-2 py-1 hover:text-chess-primary">
            {t("nav.home")}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          <span className="text-chess-primary">{t("nav.publicProfile")}</span>
        </nav>

        {loading && (
          <div className="pixel-frame pixel-hud-fill p-10 text-center font-pixel text-sm text-chess-muted">
            {t("profilePublic.loading")}
          </div>
        )}

        {error && !loading && (
          <div className="pixel-frame pixel-hud-fill border-red-500/40 p-6 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {profile && !loading && !error && !profile.activity_visible && (
          <div className="mt-4 pixel-frame pixel-hud-fill border-chess-border/60 p-4 text-center text-sm text-chess-primary">
            <p className="font-pixel text-xs text-chess-muted">{t("nav.publicProfile")}</p>
            <p className="mt-2 font-pixel text-sm text-chess-primary">{t("profilePublic.private")}</p>
            <p className="mt-2 text-xs text-chess-muted">{t("profilePublic.privateDesc")}</p>
          </div>
        )}

        {profile && !loading && !error && (
          <>
            <header className="pixel-frame pixel-hud-fill overflow-hidden">
              <div className="h-16 border-b-2 border-chess-border bg-chess-elevated pixel-hud-fill sm:h-20" />
              <div
                className={`relative px-5 pt-4 sm:px-8 ${profile.activity_visible ? "pb-5" : "pb-6"}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                  <div className="relative shrink-0">
                    {!profile.activity_visible ? (
                      <div
                        className="flex h-24 w-24 items-center justify-center pixel-frame pixel-hud-fill sm:h-28 sm:w-28"
                        aria-hidden
                      >
                        <span className="flex h-16 w-16 items-center justify-center border-2 border-chess-border bg-chess-surface">
                          <span className="h-2 w-2 bg-chess-accent" style={{ imageRendering: "pixelated" }} />
                        </span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveAvatarUrl(profile.avatar_url)}
                        alt=""
                        className="h-24 w-24 object-cover pixel-frame sm:h-28 sm:w-28"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_AVATAR_PATH;
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-0.5">
                    <h1 className="font-pixel text-xl font-bold tracking-wide text-chess-primary pixel-glitch-title sm:text-2xl">
                      {profile.display_name}
                    </h1>
                    <p className="mt-1 font-pixel text-[11px] text-chess-muted sm:text-xs">
                      {!profile.activity_visible
                        ? t("profilePublic.private")
                        : profile.profile_public
                          ? t("profilePublic.public")
                          : t("profilePublic.private")}
                    </p>
                  </div>
                </div>

                {profile.activity_visible && (
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="pixel-frame pixel-hud-fill px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex items-center gap-2 text-chess-muted">
                        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="font-pixel text-[15px] font-medium uppercase tracking-wide sm:text-[15px]">
                          {t("profilePublic.posts")}
                        </span>
                      </div>
                      <p className="mt-1 font-pixel text-xl tabular-nums text-chess-primary sm:text-2xl">
                        {postsTotal}
                      </p>
                    </div>
                    <div className="pixel-frame pixel-hud-fill px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex items-center gap-2 text-chess-muted">
                        <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="font-pixel text-[15px] font-medium uppercase tracking-wide sm:text-[15px]">
                          {t("profilePublic.commentsTab")}
                        </span>
                      </div>
                      <p className="mt-1 font-pixel text-xl tabular-nums text-chess-primary sm:text-2xl">
                        {commentsTotal}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </header>

            {profile.activity_visible && (
              <>
                <div className="mt-6 flex gap-1 p-1 pixel-frame pixel-hud-fill">
                  <button
                    type="button"
                    onClick={() => setTab("posts")}
                    className={`font-pixel flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-semibold sm:gap-2 sm:px-3 sm:py-2.5 sm:text-xs ${
                      tab === "posts"
                        ? "bg-chess-accent text-white pixel-btn"
                        : "text-chess-muted hover:text-chess-primary pixel-btn bg-transparent shadow-none"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                    {t("profilePublic.tabPosts")}
                    <span
                      className={`min-w-[1.25rem] px-1.5 py-0.5 text-[15px] tabular-nums sm:text-[15px] ${
                        tab === "posts" ? "bg-white/20 text-white" : "bg-chess-border/40 text-chess-muted"
                      }`}
                    >
                      {postsTotal}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("comments")}
                    className={`font-pixel flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-semibold sm:gap-2 sm:px-3 sm:py-2.5 sm:text-xs ${
                      tab === "comments"
                        ? "bg-chess-accent text-white pixel-btn"
                        : "text-chess-muted hover:text-chess-primary pixel-btn bg-transparent shadow-none"
                    }`}
                  >
                    <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                    {t("profilePublic.commentsTab")}
                    <span
                      className={`min-w-[1.25rem] px-1.5 py-0.5 text-[15px] tabular-nums sm:text-[15px] ${
                        tab === "comments" ? "bg-white/20 text-white" : "bg-chess-border/40 text-chess-muted"
                      }`}
                    >
                      {commentsTotal}
                    </span>
                  </button>
                </div>

                <section
                  className={`mt-5 space-y-3 transition-opacity ${listRefreshing ? "pointer-events-none opacity-60" : ""}`}
                  aria-live="polite"
                  aria-busy={listRefreshing}
                >
                  {tab === "posts" &&
                    (postsTotal === 0 ? (
                      <p className="border-2 border-dashed border-chess-border py-10 text-center font-pixel text-xs text-chess-muted sm:text-sm">
                        {t("profilePublic.emptyPosts")}
                      </p>
                    ) : (
                      posts.map((p) => (
                        <article
                          key={p.id}
                          className="group min-w-0 max-w-full pixel-frame pixel-hud-fill p-4 transition-[filter] hover:brightness-[1.02] dark:hover:brightness-110"
                        >
                          <Link
                            href={forumPostHref(p)}
                            className="block min-w-0 max-w-full font-pixel text-sm font-bold text-chess-primary no-underline group-hover:text-chess-accent sm:text-base"
                          >
                            <span className="line-clamp-2 w-full min-w-0 max-w-full break-all [overflow-wrap:anywhere] [word-break:break-word]">
                              {p.title}
                            </span>
                          </Link>
                          <p className="mt-2 max-w-full break-words text-sm leading-relaxed text-chess-muted [overflow-wrap:anywhere] line-clamp-4">
                            {p.body_preview}
                          </p>
                          <time
                            className="mt-3 block font-pixel text-[15px] tabular-nums text-chess-muted sm:text-[15px]"
                            dateTime={p.created_at}
                          >
                            {formatPostDateTime(p.created_at, language)}
                          </time>
                        </article>
                      ))
                    ))}
                  {tab === "posts" && postsPageCount > 1 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-center font-pixel text-[11px] text-chess-muted tabular-nums sm:text-xs">
                        {t("forum.pagination.showing")
                          .replace("{start}", String(postsRangeStart))
                          .replace("{end}", String(postsRangeEnd))
                          .replace("{total}", String(postsTotal))}
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPostsPage((prev) => Math.max(1, prev - 1))}
                          disabled={postsPage === 1 || listRefreshing}
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
                          disabled={postsPage === postsPageCount || listRefreshing}
                          className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          {t("forum.pagination.next")}
                        </button>
                      </div>
                    </div>
                  )}

                  {tab === "comments" &&
                    (commentsTotal === 0 ? (
                      <p className="border-2 border-dashed border-chess-border py-10 text-center font-pixel text-xs text-chess-muted sm:text-sm">
                        {t("profilePublic.emptyComments")}
                      </p>
                    ) : (
                      comments.map((c) => (
                        <article
                          key={c.id}
                          className="pixel-frame pixel-hud-fill p-4 transition-[filter] hover:brightness-[1.02] dark:hover:brightness-110"
                        >
                          <Link
                            href={forumPostHref({
                              public_id: c.post_public_id,
                              id: c.post_id,
                              board_category: c.post_board_category,
                            })}
                            className="font-pixel text-xs font-bold text-chess-accent [overflow-wrap:anywhere] hover:brightness-110 sm:text-sm"
                          >
                            {c.post_title}
                          </Link>
                          <p className="mt-2 max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-chess-primary [overflow-wrap:anywhere]">
                            {c.body}
                          </p>
                          <time
                            className="mt-3 block font-pixel text-[15px] tabular-nums text-chess-muted sm:text-[15px]"
                            dateTime={c.created_at}
                          >
                            {formatPostDateTime(c.created_at, language)}
                          </time>
                        </article>
                      ))
                    ))}
                  {tab === "comments" && commentsPageCount > 1 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-center font-pixel text-[11px] text-chess-muted tabular-nums sm:text-xs">
                        {t("forum.pagination.showing")
                          .replace("{start}", String(commentsRangeStart))
                          .replace("{end}", String(commentsRangeEnd))
                          .replace("{total}", String(commentsTotal))}
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCommentsPage((prev) => Math.max(1, prev - 1))}
                          disabled={commentsPage === 1 || listRefreshing}
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
                          disabled={commentsPage === commentsPageCount || listRefreshing}
                          className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          {t("forum.pagination.next")}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
