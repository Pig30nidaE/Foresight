"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, FileText, MessageCircle } from "lucide-react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { resolveAvatarUrl } from "@/shared/lib/avatarUrl";
import { useTranslation } from "@/shared/lib/i18n";

type PublicPost = {
  id: string;
  public_id: string;
  title: string;
  body_preview: string;
  created_at: string;
};

type PublicComment = {
  id: string;
  body: string;
  created_at: string;
  post_id: string;
  post_public_id: string;
  post_title: string;
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
};

export default function PublicUserProfileView() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [tab, setTab] = useState<"posts" | "comments">("posts");

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
        setLoading(true);
        const token = await getBackendJwt();
        const { data } = await api.get<UserPublicProfile>(`/forum/users/${userId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setProfile(data);
        setError(null);
      } catch (e: unknown) {
        const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(typeof d === "string" ? d : "사용자 프로필을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [userId]);

  return (
    <div className="min-h-[60vh] pb-16">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
        <nav className="mb-6 flex flex-wrap items-center gap-1 font-pixel text-xs text-chess-muted sm:text-sm">
          <Link href="/" className="pixel-btn px-2 py-1 hover:text-chess-primary">
            {t("nav.home")}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          <span className="text-chess-primary">{t("nav.publicProfile")}</span>
        </nav>

        {loading && (
          <div className="pixel-frame pixel-hud-fill p-10 text-center font-pixel text-sm text-chess-muted">
            불러오는 중...
          </div>
        )}

        {error && !loading && (
          <div className="pixel-frame pixel-hud-fill border-red-500/40 p-6 text-center text-sm text-red-600 dark:text-red-400">
            {error}
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
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-0.5">
                    <h1 className="font-pixel text-xl font-bold tracking-wide text-chess-primary pixel-glitch-title sm:text-2xl">
                      {profile.display_name}
                    </h1>
                    <p className="mt-1 font-pixel text-[11px] text-chess-muted sm:text-xs">
                      {!profile.activity_visible
                        ? "비공개 프로필"
                        : profile.profile_public
                          ? "공개 프로필"
                          : "비공개 프로필"}
                    </p>
                  </div>
                </div>

                {profile.activity_visible && (
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="pixel-frame pixel-hud-fill px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex items-center gap-2 text-chess-muted">
                        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="font-pixel text-[10px] font-medium uppercase tracking-wide sm:text-[11px]">
                          게시글
                        </span>
                      </div>
                      <p className="mt-1 font-pixel text-xl tabular-nums text-chess-primary sm:text-2xl">
                        {profile.posts.length}
                      </p>
                    </div>
                    <div className="pixel-frame pixel-hud-fill px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex items-center gap-2 text-chess-muted">
                        <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="font-pixel text-[10px] font-medium uppercase tracking-wide sm:text-[11px]">
                          댓글
                        </span>
                      </div>
                      <p className="mt-1 font-pixel text-xl tabular-nums text-chess-primary sm:text-2xl">
                        {profile.comments.length}
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
                    작성한 글
                    <span
                      className={`min-w-[1.25rem] px-1.5 py-0.5 text-[10px] tabular-nums sm:text-[11px] ${
                        tab === "posts" ? "bg-white/20 text-white" : "bg-chess-border/40 text-chess-muted"
                      }`}
                    >
                      {profile.posts.length}
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
                    댓글
                    <span
                      className={`min-w-[1.25rem] px-1.5 py-0.5 text-[10px] tabular-nums sm:text-[11px] ${
                        tab === "comments" ? "bg-white/20 text-white" : "bg-chess-border/40 text-chess-muted"
                      }`}
                    >
                      {profile.comments.length}
                    </span>
                  </button>
                </div>

                <section className="mt-5 space-y-3" aria-live="polite">
                  {tab === "posts" &&
                    (profile.posts.length === 0 ? (
                      <p className="border-2 border-dashed border-chess-border py-10 text-center font-pixel text-xs text-chess-muted sm:text-sm">
                        아직 작성한 글이 없습니다.
                      </p>
                    ) : (
                      profile.posts.map((p) => (
                        <article
                          key={p.id}
                          className="group pixel-frame pixel-hud-fill p-4 transition-[filter] hover:brightness-[1.02] dark:hover:brightness-110"
                        >
                          <Link
                            href={`/forum/${p.public_id ?? p.id}`}
                            className="font-pixel text-sm font-bold text-chess-primary [overflow-wrap:anywhere] group-hover:text-chess-accent sm:text-base"
                          >
                            {p.title}
                          </Link>
                          <p className="mt-2 max-w-full break-words text-sm leading-relaxed text-chess-muted [overflow-wrap:anywhere] line-clamp-4">
                            {p.body_preview}
                          </p>
                          <time
                            className="mt-3 block font-pixel text-[10px] tabular-nums text-chess-muted sm:text-[11px]"
                            dateTime={p.created_at}
                          >
                            {new Date(p.created_at).toLocaleString()}
                          </time>
                        </article>
                      ))
                    ))}

                  {tab === "comments" &&
                    (profile.comments.length === 0 ? (
                      <p className="border-2 border-dashed border-chess-border py-10 text-center font-pixel text-xs text-chess-muted sm:text-sm">
                        아직 작성한 댓글이 없습니다.
                      </p>
                    ) : (
                      profile.comments.map((c) => (
                        <article
                          key={c.id}
                          className="pixel-frame pixel-hud-fill p-4 transition-[filter] hover:brightness-[1.02] dark:hover:brightness-110"
                        >
                          <Link
                            href={`/forum/${c.post_public_id ?? c.post_id}`}
                            className="font-pixel text-xs font-bold text-chess-accent [overflow-wrap:anywhere] hover:brightness-110 sm:text-sm"
                          >
                            {c.post_title}
                          </Link>
                          <p className="mt-2 max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-chess-primary [overflow-wrap:anywhere]">
                            {c.body}
                          </p>
                          <time
                            className="mt-3 block font-pixel text-[10px] tabular-nums text-chess-muted sm:text-[11px]"
                            dateTime={c.created_at}
                          >
                            {new Date(c.created_at).toLocaleString()}
                          </time>
                        </article>
                      ))
                    ))}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
