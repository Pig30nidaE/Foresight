"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  createBoardPost,
  getBoardPosts,
  getMeSummary,
  type BoardKind,
  type BoardPostItem,
} from "@/features/community/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { AuthorNameLink } from "@/shared/components/forum/AuthorName";
import { PixelChatGlyph, PixelHeartGlyph } from "@/shared/components/ui/PixelGlyphs";
import { noticeListBadgeClass, patchListBadgeClass } from "@/shared/components/forum/boardPostBadges";
import { useTranslation } from "@/shared/lib/i18n";
import { formatPostDate } from "@/shared/lib/formatLocaleDate";
import { forumPostHref } from "@/shared/lib/forumPostHref";
import { emitTicketToast } from "@/shared/lib/ticketToast";

const SORT_OPTIONS: { value: string; labelKey: "board.sort.new" | "board.sort.old" | "board.sort.likes" | "board.sort.comments" }[] = [
  { value: "new", labelKey: "board.sort.new" },
  { value: "old", labelKey: "board.sort.old" },
  { value: "likes", labelKey: "board.sort.likes" },
  { value: "comments", labelKey: "board.sort.comments" },
];

const listUlClass =
  "divide-y divide-chess-border/60 pixel-frame bg-chess-bg/55 dark:bg-chess-surface/32";

function PostListRow({ p }: { p: BoardPostItem }) {
  const { t, language } = useTranslation();
  const href = forumPostHref(p);
  return (
    <li>
      <div className="flex flex-row flex-wrap items-start gap-3 px-3 py-2.5 text-sm transition hover:bg-chess-elevated/40 sm:items-baseline sm:gap-x-3 sm:gap-y-1 sm:px-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-1 sm:flex-row sm:items-start sm:gap-2">
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
              {p.board_category === "notice" && (
                <span className={noticeListBadgeClass}>{t("board.badge.notice")}</span>
              )}
              {p.board_category === "patch" && (
                <span className={patchListBadgeClass}>{t("board.badge.patch")}</span>
              )}
            </div>
            <Link
              href={href}
              className="line-clamp-2 min-w-0 max-w-full flex-1 overflow-hidden break-all text-base font-medium leading-snug text-chess-primary [overflow-wrap:anywhere] hover:text-chess-accent sm:break-words sm:text-sm"
            >
              {p.title}
            </Link>
          </div>
          <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm text-chess-muted sm:inline-flex sm:w-auto sm:shrink-0">
            <AuthorNameLink
              author={p.author}
              avatarSize={22}
              className="max-w-[min(100%,12rem)] hover:text-chess-accent hover:underline"
            />
            <span className="shrink-0 tabular-nums opacity-80">{formatPostDate(p.created_at, language)}</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="inline-flex items-center gap-0.5">
                <PixelHeartGlyph className="text-red-500/90 dark:text-red-400/90" size={14} />
                {p.like_count}
              </span>
              <span className="opacity-50">·</span>
              <span className="inline-flex items-center gap-0.5">
                <PixelChatGlyph size={14} />
                {p.comment_count}
              </span>
            </span>
          </span>
        </div>
      </div>
    </li>
  );
}

export default function BoardPage() {
  const { t } = useTranslation();
  const [isDesktop, setIsDesktop] = useState(false);
  const pageSize = isDesktop ? 15 : 10;
  const router = useRouter();
  const { status } = useSession();
  const [tab, setTab] = useState<BoardKind>("free");
  const [sort, setSort] = useState("new");
  const [posts, setPosts] = useState<BoardPostItem[]>([]);
  const [pinnedNotices, setPinnedNotices] = useState<BoardPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [canWrite, setCanWrite] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [createKind, setCreateKind] = useState<BoardKind>("free");
  const [busyCreate, setBusyCreate] = useState(false);
  const TITLE_MAX_LENGTH = 200;

  const inputClass =
    "w-full pixel-input px-4 py-3 text-sm text-chess-primary placeholder:text-chess-muted/70 dark:bg-chess-elevated/50";

  const formatDateForTitle = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const autoTitleByKind = (kind: BoardKind) => {
    const date = formatDateForTitle();
    if (kind === "notice") return t("board.autoTitle.notice").replace("{date}", date);
    if (kind === "patch") return t("board.autoTitle.patch").replace("{date}", date);
    return "";
  };

  const onChangeCreateKind = (kind: BoardKind) => {
    setCreateKind(kind);
    if (kind === "notice" || kind === "patch") {
      setCreateTitle(autoTitleByKind(kind));
    }
  };

  const fetchList = async (append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const normalized = searchQuery.trim();
      const isRankSort = sort === "likes" || sort === "comments";
      const baseParams: Record<string, string | number> = { sort, limit: pageSize };
      if (normalized) baseParams.q = normalized;
      if (append) {
        if (isRankSort && nextPage) baseParams.page = nextPage;
        if (!isRankSort && nextCursor) baseParams.cursor = nextCursor;
      }

      if (tab === "notice" || tab === "patch") {
        const data = await getBoardPosts({ ...baseParams, kind: tab });
        setPinnedNotices([]);
        const items = data.items ?? [];
        setPosts((prev) => (append ? [...prev, ...items] : items));
        setNextCursor(data.next_cursor ?? null);
        setNextPage(data.next_page ?? null);
      } else {
        if (!append && !normalized) {
          const [freeRes, pinRes] = await Promise.all([
            getBoardPosts({ ...baseParams, kind: "free" }),
            getBoardPosts({ kind: "notice", sort: "new", limit: 5 }),
          ]);
          const freeItems = freeRes.items ?? [];
          setPosts(freeItems);
          setNextCursor(freeRes.next_cursor ?? null);
          setNextPage(freeRes.next_page ?? null);
          setPinnedNotices(pinRes.items ?? []);
        } else {
          const freeRes = await getBoardPosts({ ...baseParams, kind: "free" });
          const freeItems = freeRes.items ?? [];
          setPosts((prev) => (append ? [...prev, ...freeItems] : freeItems));
          setNextCursor(freeRes.next_cursor ?? null);
          setNextPage(freeRes.next_page ?? null);
          if (!append && normalized) setPinnedNotices([]);
        }
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(typeof err?.response?.data?.detail === "string" ? err.response.data.detail : t("board.error.list"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void fetchList(false);
  }, [tab, sort, searchQuery, pageSize]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = () => setIsDesktop(desktopQuery.matches);
    syncDesktop();
    desktopQuery.addEventListener("change", syncDesktop);
    return () => desktopQuery.removeEventListener("change", syncDesktop);
  }, []);

  useEffect(() => {
    const loadMe = async () => {
      if (status !== "authenticated") {
        setCanWrite(true);
        setIsAdmin(false);
        return;
      }
      try {
        const token = await getBackendJwt();
        if (!token) {
          setCanWrite(true);
          setIsAdmin(false);
          return;
        }
        const data = await getMeSummary(token);
        setCanWrite(true);
        setIsAdmin((data.role ?? "").toLowerCase() === "admin");
      } catch {
        setCanWrite(true);
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
    if (createTitle.trim().length > TITLE_MAX_LENGTH) {
      setError(t("forum.error.titleTooLong"));
      return;
    }
    if ((createKind === "notice" || createKind === "patch") && !isAdmin) return;
    setBusyCreate(true);
    try {
      const token = await getBackendJwt().catch(() => null);
      const data = await createBoardPost(token, {
        title: createTitle.trim(),
        body: createBody.trim(),
        kind: createKind,
      });
      setCreating(false);
      setCreateTitle("");
      setCreateBody("");
      setCreateKind("free");
      const earned = (data as Record<string, unknown>)?.tickets_earned;
      const cooldownSeconds = (data as Record<string, unknown>)?.ticket_cooldown_seconds;
      if (typeof earned === "number" && earned > 0) {
        emitTicketToast({
          message: t("ticket.earn.post"),
          cooldownSeconds: typeof cooldownSeconds === "number" ? cooldownSeconds : 0,
        });
      } else if (typeof cooldownSeconds === "number" && cooldownSeconds > 0) {
        emitTicketToast({
          message: t("ticket.cooldown.active"),
          cooldownSeconds,
        });
      }
      await fetchList();
      const slug = data?.public_id ?? data?.id;
      if (slug) router.push(forumPostHref({ public_id: slug, id: slug, board_category: createKind }));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? t("board.error.createFailed"));
    } finally {
      setBusyCreate(false);
    }
  };

  const listEmpty =
    tab === "notice" || tab === "patch"
      ? posts.length === 0
      : pinnedNotices.length === 0 && posts.length === 0;
  const hasMore = Boolean(nextCursor || nextPage);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchDraft.trim());
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5 border-b border-chess-border/60 pb-3 sm:gap-2">
        <button
          type="button"
          onClick={() => setTab("notice")}
          className={`font-pixel pixel-btn min-w-0 px-2 py-2 text-center text-xs font-semibold leading-tight sm:px-3 sm:text-sm ${
            tab === "notice"
              ? "bg-chess-accent text-white border-chess-accent"
              : "bg-chess-surface/80 text-chess-muted hover:text-chess-primary"
          }`}
        >
          {t("board.tab.notice")}
        </button>
        <button
          type="button"
          onClick={() => setTab("patch")}
          className={`font-pixel pixel-btn min-w-0 px-2 py-2 text-center text-xs font-semibold leading-tight sm:px-3 sm:text-sm ${
            tab === "patch"
              ? "bg-chess-accent text-white border-chess-accent"
              : "bg-chess-surface/80 text-chess-muted hover:text-chess-primary"
          }`}
        >
          {t("board.tab.patch")}
        </button>
        <button
          type="button"
          onClick={() => setTab("free")}
          className={`font-pixel pixel-btn min-w-0 px-2 py-2 text-center text-xs font-semibold leading-tight sm:px-3 sm:text-sm ${
            tab === "free"
              ? "bg-chess-accent text-white border-chess-accent"
              : "bg-chess-surface/80 text-chess-muted hover:text-chess-primary"
          }`}
        >
          {t("board.tab.free")}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 text-sm text-chess-muted sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0 text-xs font-medium sm:text-sm">{t("board.sort.label")}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="pixel-input min-h-[44px] w-full px-3 py-2.5 text-base text-chess-primary sm:min-h-0 sm:w-auto sm:text-sm"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <form
            onSubmit={onSearchSubmit}
            className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2"
          >
            <input
              type="search"
              enterKeyHint="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t("board.search.placeholder")}
              className="pixel-input min-h-[44px] w-full px-3 py-2.5 text-base text-chess-primary sm:min-w-[12rem] sm:flex-1 sm:text-sm"
            />
            <button
              type="submit"
              className="font-pixel pixel-btn min-h-[44px] w-full px-4 py-2.5 text-sm bg-chess-surface/80 text-chess-primary sm:w-auto sm:min-h-0 sm:py-2"
            >
              {t("board.search.submit")}
            </button>
          </form>
        </div>
        {status === "loading" ? (
          <p className="font-pixel text-xs text-chess-muted sm:text-right">{t("forum.checkingAccount")}</p>
        ) : canWrite ? (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="font-pixel pixel-btn inline-flex min-h-[44px] w-full items-center justify-center gap-2 bg-chess-accent px-4 py-2.5 text-sm font-semibold text-white border-chess-accent hover:brightness-105 sm:w-auto sm:min-h-0"
          >
            <PenLine className="size-4 opacity-90" aria-hidden />
            {creating ? t("board.write.close") : t("board.write.open")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (status !== "authenticated") router.push("/api/auth/signin?callbackUrl=%2Fpost-login");
              else router.push("/signup/consent");
            }}
            className="min-h-[44px] w-full rounded-xl border border-chess-border/90 px-4 py-2.5 text-sm font-medium text-chess-primary sm:w-auto sm:min-h-0"
          >
            {status === "authenticated" ? t("board.write.afterProfile") : t("board.write.afterSignIn")}
          </button>
        )}
      </div>

      {creating && canWrite && (
        <form
          onSubmit={onCreate}
          className="space-y-3 pixel-frame bg-chess-surface/45 p-4 dark:bg-chess-elevated/22"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-chess-muted">{t("board.newPost")}</p>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="bk"
                  checked={createKind === "notice"}
                  onChange={() => onChangeCreateKind("notice")}
                />
                {t("board.tab.notice")}
              </label>
            )}
            {isAdmin && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="bk"
                  checked={createKind === "patch"}
                  onChange={() => onChangeCreateKind("patch")}
                />
                {t("board.tab.patch")}
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="bk"
                checked={createKind === "free"}
                onChange={() => onChangeCreateKind("free")}
              />
              {t("board.tab.free")}
            </label>
          </div>
          <input
            type="text"
            required
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            maxLength={TITLE_MAX_LENGTH}
            placeholder={t("board.field.title")}
            className={`${inputClass} text-base leading-relaxed [overflow-wrap:anywhere]`}
          />
          <textarea
            required
            rows={6}
            value={createBody}
            onChange={(e) => setCreateBody(e.target.value)}
            placeholder={t("board.field.body")}
            className={`${inputClass} resize-y`}
          />
          <button
            type="submit"
            disabled={busyCreate}
            className="font-pixel pixel-btn inline-flex items-center gap-2 bg-chess-accent px-5 py-2.5 text-sm font-semibold text-white border-chess-accent disabled:opacity-50"
          >
            {busyCreate ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("board.submit")}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-chess-muted">{t("board.loading")}</p>}

      {!loading && !error && listEmpty && (
        <p className="pixel-frame border-dashed border-chess-border px-4 py-8 text-center text-sm text-chess-muted">{t("board.empty")}</p>
      )}

      {!loading && !error && !listEmpty && tab === "free" && pinnedNotices.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-chess-muted">{t("board.latestNotice")}</p>
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
            <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-chess-muted">{t("board.freeTitle")}</p>
          )}
          <ul className={listUlClass}>
            {posts.map((p) => (
              <PostListRow key={p.id} p={p} />
            ))}
          </ul>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchList(true)}
                disabled={loadingMore}
                className="font-pixel pixel-btn px-4 py-2 text-sm bg-chess-surface/80 text-chess-primary disabled:opacity-50"
              >
                {loadingMore ? t("board.loading") : t("board.loadMore")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
