"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, FileText, MessageCircle } from "lucide-react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";

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
  /** false for other users when profile is private — hide posts/comments UI */
  activity_visible: boolean;
  posts: PublicPost[];
  comments: PublicComment[];
};

function displayInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() ?? "?";
}

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;
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

  const initials = useMemo(
    () => (profile ? displayInitials(profile.display_name) : ""),
    [profile]
  );

  return (
    <div className="min-h-[60vh] bg-gradient-to-b from-chess-bg via-chess-bg to-chess-surface/30 pb-16">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-chess-muted">
          <Link href="/forum" className="transition hover:text-chess-accent">
            포럼
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          <span className="text-chess-primary">프로필</span>
        </nav>

        {loading && (
          <div className="rounded-2xl border border-chess-border/80 bg-chess-elevated/40 p-10 text-center text-chess-muted">
            불러오는 중...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {profile && !loading && !error && (
          <>
            <header className="overflow-hidden rounded-2xl border border-chess-border/80 bg-chess-elevated/50 shadow-sm dark:bg-chess-elevated/30 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
              <div className="h-24 bg-[#e8dcc8]/90 dark:bg-chess-accent/15 sm:h-28" />
              <div
                className={`relative bg-chess-bg/95 px-5 pt-0 dark:bg-chess-bg/90 sm:px-8 ${profile.activity_visible ? "pb-6" : "pb-8"}`}
              >
                <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:gap-6">
                  <div className="relative shrink-0">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt=""
                        className="h-28 w-28 rounded-2xl border-4 border-white bg-white object-cover shadow-md dark:border-chess-bg sm:h-32 sm:w-32"
                        referrerPolicy="no-referrer"
                      />
                    ) : !profile.activity_visible ? (
                      <div
                        className="flex h-28 w-28 items-center justify-center rounded-2xl border-4 border-white bg-white shadow-md dark:border-chess-bg sm:h-32 sm:w-32"
                        aria-hidden
                      >
                        <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-2 border-sky-500/70 sm:h-[5rem] sm:w-[5rem]">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                        </span>
                      </div>
                    ) : (
                      <div
                        className="flex h-28 w-28 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-chess-accent/30 to-chess-accent/10 text-2xl font-bold tracking-tight text-chess-primary shadow-md dark:border-chess-bg sm:h-32 sm:w-32 sm:text-3xl"
                        aria-hidden
                      >
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <h1 className="text-2xl font-bold tracking-tight text-chess-primary sm:text-3xl">
                      {profile.display_name}
                    </h1>
                    <p className="mt-1 text-sm text-chess-muted">
                      {!profile.activity_visible
                        ? "비공개 프로필"
                        : profile.profile_public
                          ? "공개 프로필"
                          : "비공개 프로필"}
                    </p>
                  </div>
                </div>

                {profile.activity_visible && (
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="rounded-xl border border-chess-border/60 bg-chess-bg/60 px-4 py-3 dark:bg-chess-bg/40">
                      <div className="flex items-center gap-2 text-chess-muted">
                        <FileText className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="text-xs font-medium uppercase tracking-wide">게시글</span>
                      </div>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-chess-primary">
                        {profile.posts.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-chess-border/60 bg-chess-bg/60 px-4 py-3 dark:bg-chess-bg/40">
                      <div className="flex items-center gap-2 text-chess-muted">
                        <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="text-xs font-medium uppercase tracking-wide">댓글</span>
                      </div>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-chess-primary">
                        {profile.comments.length}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </header>

            {profile.activity_visible && (
              <>
            <div className="mt-8 flex gap-1 rounded-xl border border-chess-border/60 bg-chess-elevated/30 p-1 dark:bg-chess-elevated/20">
              <button
                type="button"
                onClick={() => setTab("posts")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "posts"
                    ? "bg-chess-bg text-chess-primary shadow-sm dark:bg-chess-bg/80"
                    : "text-chess-muted hover:text-chess-primary"
                }`}
              >
                <FileText className="h-4 w-4" aria-hidden />
                작성한 글
                <span className="rounded-full bg-chess-border/50 px-2 py-0.5 text-xs tabular-nums text-chess-muted">
                  {profile.posts.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTab("comments")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "comments"
                    ? "bg-chess-bg text-chess-primary shadow-sm dark:bg-chess-bg/80"
                    : "text-chess-muted hover:text-chess-primary"
                }`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                댓글
                <span className="rounded-full bg-chess-border/50 px-2 py-0.5 text-xs tabular-nums text-chess-muted">
                  {profile.comments.length}
                </span>
              </button>
            </div>

            <section className="mt-6 space-y-3" aria-live="polite">
              {tab === "posts" &&
                (profile.posts.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-chess-border/80 py-12 text-center text-sm text-chess-muted">
                    아직 작성한 글이 없습니다.
                  </p>
                ) : (
                  profile.posts.map((p) => (
                    <article
                      key={p.id}
                      className="group rounded-xl border border-chess-border/70 bg-chess-elevated/20 p-4 transition hover:border-chess-accent/30 hover:bg-chess-elevated/35 dark:hover:bg-chess-elevated/25"
                    >
                      <Link
                        href={`/forum/${p.public_id ?? p.id}`}
                        className="text-base font-semibold text-chess-primary [overflow-wrap:anywhere] group-hover:text-chess-accent"
                      >
                        {p.title}
                      </Link>
                      <p className="mt-2 max-w-full break-words text-sm leading-relaxed text-chess-muted [overflow-wrap:anywhere] line-clamp-4">
                        {p.body_preview}
                      </p>
                      <time
                        className="mt-3 block text-xs text-chess-muted/80"
                        dateTime={p.created_at}
                      >
                        {new Date(p.created_at).toLocaleString()}
                      </time>
                    </article>
                  ))
                ))}

              {tab === "comments" &&
                (profile.comments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-chess-border/80 py-12 text-center text-sm text-chess-muted">
                    아직 작성한 댓글이 없습니다.
                  </p>
                ) : (
                  profile.comments.map((c) => (
                    <article
                      key={c.id}
                      className="rounded-xl border border-chess-border/70 bg-chess-elevated/20 p-4 transition hover:border-chess-accent/30"
                    >
                      <Link
                        href={`/forum/${c.post_public_id ?? c.post_id}`}
                        className="text-sm font-semibold text-chess-accent [overflow-wrap:anywhere] hover:underline"
                      >
                        {c.post_title}
                      </Link>
                      <p className="mt-2 max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-chess-primary [overflow-wrap:anywhere]">
                        {c.body}
                      </p>
                      <time
                        className="mt-3 block text-xs text-chess-muted/80"
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
