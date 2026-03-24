"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { AuthorNameLink } from "@/shared/components/forum/AuthorName";
import { PixelChatGlyph, PixelHeartGlyph } from "@/shared/components/ui/PixelGlyphs";
import { noticeListBadgeClass, patchListBadgeClass } from "@/shared/components/forum/boardPostBadges";

type BoardKind = "notice" | "patch" | "free";

type PostRow = {
  id: string;
  public_id: string;
  title: string;
  board_category?: string | null;
  author: { id: string; public_id: string; display_name: string; role?: string };
  created_at: string;
  like_count: number;
  comment_count: number;
};

type ListResponse = { items: PostRow[] };

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "최신순" },
  { value: "old", label: "오래된순" },
  { value: "likes", label: "좋아요순" },
  { value: "comments", label: "댓글순" },
];

const listUlClass =
  "divide-y divide-chess-border/60 pixel-frame bg-chess-bg/55 dark:bg-chess-surface/32";

function PostListRow({ p }: { p: PostRow }) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm transition hover:bg-chess-elevated/40 sm:px-4">
        <Link
          href={`/forum/${p.public_id ?? p.id}`}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-medium text-chess-primary [overflow-wrap:anywhere] hover:text-chess-accent"
        >
          {p.board_category === "notice" && (
            <span className={noticeListBadgeClass}>공지</span>
          )}
          {p.board_category === "patch" && (
            <span className={patchListBadgeClass}>패치</span>
          )}
          <span className="min-w-0">{p.title}</span>
        </Link>
        <span className="inline-flex shrink-0 flex-wrap items-center gap-2 text-xs text-chess-muted">
          <AuthorNameLink
            author={p.author}
            avatarSize={22}
            className="max-w-[10rem] hover:text-chess-accent hover:underline"
          />
          <span className="shrink-0 tabular-nums opacity-80">
            {new Date(p.created_at).toLocaleDateString()}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-chess-muted inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5">
            <PixelHeartGlyph className="text-red-500/90 dark:text-red-400/90" size={12} />
            {p.like_count}
          </span>
          <span className="opacity-50">·</span>
          <span className="inline-flex items-center gap-0.5">
            <PixelChatGlyph size={12} />
            {p.comment_count}
          </span>
        </span>
      </div>
    </li>
  );
}

export default function BoardPage() {
  const router = useRouter();
  const { status } = useSession();
  const [tab, setTab] = useState<BoardKind>("free");
  const [sort, setSort] = useState("new");
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [pinnedNotices, setPinnedNotices] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [canWrite, setCanWrite] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [createKind, setCreateKind] = useState<BoardKind>("free");
  const [busyCreate, setBusyCreate] = useState(false);

  const inputClass =
    "w-full pixel-input px-4 py-3 text-sm text-chess-primary placeholder:text-chess-muted/70 dark:bg-chess-elevated/50";

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "notice" || tab === "patch") {
        const { data } = await api.get<ListResponse>("/forum/board/posts", {
          params: { kind: tab, sort, limit: "40" },
        });
        setPinnedNotices([]);
        setPosts(data.items ?? []);
      } else {
        const [pinRes, freeRes] = await Promise.all([
          api.get<ListResponse>("/forum/board/posts", {
            params: { kind: "notice", sort: "new", limit: "5" },
          }),
          api.get<ListResponse>("/forum/board/posts", {
            params: { kind: "free", sort, limit: "40" },
          }),
        ]);
        setPinnedNotices(pinRes.data.items ?? []);
        setPosts(freeRes.data.items ?? []);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(typeof err?.response?.data?.detail === "string" ? err.response.data.detail : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [tab, sort]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    const loadMe = async () => {
      if (status !== "authenticated") {
        setCanWrite(false);
        setIsAdmin(false);
        return;
      }
      try {
        const token = await getBackendJwt();
        if (!token) {
          setCanWrite(false);
          setIsAdmin(false);
          return;
        }
        const { data } = await api.get<{ signup_completed?: boolean; role?: string }>("/forum/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCanWrite(Boolean(data?.signup_completed));
        setIsAdmin((data?.role ?? "").toLowerCase() === "admin");
      } catch {
        setCanWrite(false);
        setIsAdmin(false);
      }
    };
    void loadMe();
  }, [status]);

  useEffect(() => {
    if (creating && !isAdmin && (createKind === "notice" || createKind === "patch")) {
      setCreateKind("free");
    }
  }, [creating, isAdmin, createKind]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!canWrite || busyCreate) return;
    if (!createTitle.trim() || !createBody.trim()) return;
    if ((createKind === "notice" || createKind === "patch") && !isAdmin) return;
    setBusyCreate(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error("로그인이 필요합니다.");
      const { data } = await api.post<{ id: string; public_id?: string }>(
        "/forum/board/posts",
        { title: createTitle.trim(), body: createBody.trim(), kind: createKind },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCreating(false);
      setCreateTitle("");
      setCreateBody("");
      setCreateKind("free");
      await fetchList();
      const slug = data?.public_id ?? data?.id;
      if (slug) router.push(`/forum/${slug}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? "작성에 실패했습니다.");
    } finally {
      setBusyCreate(false);
    }
  };

  const listEmpty =
    tab === "notice" || tab === "patch"
      ? posts.length === 0
      : pinnedNotices.length === 0 && posts.length === 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-chess-border/60 pb-3">
        <button
          type="button"
          onClick={() => setTab("notice")}
          className={`font-pixel pixel-btn px-4 py-2 text-sm font-semibold ${
            tab === "notice"
              ? "bg-chess-accent text-white border-chess-accent"
              : "bg-chess-surface/80 text-chess-muted hover:text-chess-primary"
          }`}
        >
          공지사항
        </button>
        <button
          type="button"
          onClick={() => setTab("patch")}
          className={`font-pixel pixel-btn px-4 py-2 text-sm font-semibold ${
            tab === "patch"
              ? "bg-chess-accent text-white border-chess-accent"
              : "bg-chess-surface/80 text-chess-muted hover:text-chess-primary"
          }`}
        >
          패치노트
        </button>
        <button
          type="button"
          onClick={() => setTab("free")}
          className={`font-pixel pixel-btn px-4 py-2 text-sm font-semibold ${
            tab === "free"
              ? "bg-chess-accent text-white border-chess-accent"
              : "bg-chess-surface/80 text-chess-muted hover:text-chess-primary"
          }`}
        >
          자유글
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-chess-muted">
          <span>정렬</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="pixel-input px-3 py-2 text-sm text-chess-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="font-pixel pixel-btn inline-flex items-center gap-2 bg-chess-accent px-4 py-2 text-sm font-semibold text-white border-chess-accent hover:brightness-105"
          >
            <PenLine className="size-4 opacity-90" aria-hidden />
            {creating ? "닫기" : "글쓰기"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (status !== "authenticated") router.push("/api/auth/signin?callbackUrl=%2Fpost-login");
              else router.push("/signup/consent");
            }}
            className="rounded-xl border border-chess-border/90 px-4 py-2 text-sm font-medium text-chess-primary"
          >
            {status === "authenticated" ? "가입 완료 후 글쓰기" : "로그인 후 글쓰기"}
          </button>
        )}
      </div>

      {creating && canWrite && (
        <form
          onSubmit={onCreate}
          className="space-y-3 pixel-frame bg-chess-surface/45 p-4 dark:bg-chess-elevated/22"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-chess-muted">새 글</p>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="bk"
                  checked={createKind === "notice"}
                  onChange={() => setCreateKind("notice")}
                />
                공지사항
              </label>
            )}
            {isAdmin && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="bk"
                  checked={createKind === "patch"}
                  onChange={() => setCreateKind("patch")}
                />
                패치노트
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="bk"
                checked={createKind === "free"}
                onChange={() => setCreateKind("free")}
              />
              자유글
            </label>
          </div>
          <input
            type="text"
            required
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder="제목"
            className={inputClass}
          />
          <textarea
            required
            rows={6}
            value={createBody}
            onChange={(e) => setCreateBody(e.target.value)}
            placeholder="본문"
            className={`${inputClass} resize-y`}
          />
          <button
            type="submit"
            disabled={busyCreate}
            className="font-pixel pixel-btn inline-flex items-center gap-2 bg-chess-accent px-5 py-2.5 text-sm font-semibold text-white border-chess-accent disabled:opacity-50"
          >
            {busyCreate ? <Loader2 className="size-4 animate-spin" /> : null}
            등록
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-chess-muted">불러오는 중…</p>}

      {!loading && !error && listEmpty && (
        <p className="pixel-frame border-dashed border-chess-border px-4 py-8 text-center text-sm text-chess-muted">글이 없습니다.</p>
      )}

      {!loading && !error && !listEmpty && tab === "free" && pinnedNotices.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-chess-muted">최신 공지</p>
          <ul className={listUlClass}>
            {pinnedNotices.map((p) => (
              <PostListRow key={p.id} p={p} />
            ))}
          </ul>
        </div>
      )}

      {!loading && !error && !listEmpty && posts.length > 0 && (
        <div className={tab === "free" && pinnedNotices.length > 0 ? "space-y-1" : ""}>
          {tab === "free" && pinnedNotices.length > 0 && (
            <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-chess-muted">자유글</p>
          )}
          <ul className={listUlClass}>
            {posts.map((p) => (
              <PostListRow key={p.id} p={p} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
