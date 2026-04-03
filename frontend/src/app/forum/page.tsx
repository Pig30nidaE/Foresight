"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, ChevronUp, Loader2, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import ForumBoardEditOverlay from "@/features/forum/components/ForumBoardEditOverlay";
import ForumBoardPeekCard from "@/features/forum/components/ForumBoardPeekCard";
import ForumRecordedMoveChips from "@/features/forum/components/ForumRecordedMoveChips";
import ForumPgnReplay from "@/features/forum/components/ForumPgnReplay";
import ForumPostThumbnail from "@/features/forum/components/ForumPostThumbnail";
import { fetchForumPosts, fetchMyWritePermission, type PostItem, type PostListResponse } from "@/features/forum";
import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import {
  buildPgnFromStartAndUcis,
  composerPreviewFen,
  DEFAULT_START_FEN,
  fenAfterUcis,
  isForumPgnReplayable,
  normalizeFenForDisplay,
  sanListFromStartAndUcis,
} from "@/shared/lib/forumChess";
import {
  boardAnnotationsToPayload,
  emptyBoardAnnotations,
  pruneAnnotationsBeyondPly,
  type BoardAnnotations,
} from "@/shared/lib/forumBoardAnnotations";
import { AuthorNameLink } from "@/shared/components/forum/AuthorName";
import { PixelChatGlyph, PixelHeartGlyph } from "@/shared/components/ui/PixelGlyphs";
import { useTranslation } from "@/shared/lib/i18n";
import { formatPostDate } from "@/shared/lib/formatLocaleDate";
import { forumPostHref } from "@/shared/lib/forumPostHref";

function resetComposeState(setters: {
  setCreateTitle: (v: string) => void;
  setCreateBody: (v: string) => void;
  setCreateBoardFen: (v: string) => void;
  setChessImported: (v: boolean) => void;
  setBoardOverlayOpen: (v: boolean) => void;
  setComposeBoardSectionExpanded: (v: boolean) => void;
  setComposeBoardAnnotations: Dispatch<SetStateAction<BoardAnnotations>>;
  setComposeRecordMoves: (v: boolean) => void;
  setComposeMoveUcis: (v: string[]) => void;
  setComposeRecordStartFen: (v: string) => void;
}) {
  setters.setCreateTitle("");
  setters.setCreateBody("");
  setters.setCreateBoardFen(DEFAULT_START_FEN);
  setters.setChessImported(false);
  setters.setBoardOverlayOpen(false);
  setters.setComposeBoardSectionExpanded(false);
  setters.setComposeBoardAnnotations(emptyBoardAnnotations());
  setters.setComposeRecordMoves(false);
  setters.setComposeMoveUcis([]);
  setters.setComposeRecordStartFen(DEFAULT_START_FEN);
}

export default function ForumPage() {
  const { t, language } = useTranslation();
  const [isDesktop, setIsDesktop] = useState(false);
  const pageSize = isDesktop ? 8 : 4;
  const router = useRouter();
  const { status } = useSession();
  const sessionLoading = status === "loading";
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMe, setLoadingMe] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [createBoardFen, setCreateBoardFen] = useState(DEFAULT_START_FEN);
  const [chessImported, setChessImported] = useState(false);
  const [boardOverlayOpen, setBoardOverlayOpen] = useState(false);
  const [composeBoardSectionExpanded, setComposeBoardSectionExpanded] = useState(false);
  const [composeBoardAnnotations, setComposeBoardAnnotations] = useState<BoardAnnotations>(() =>
    emptyBoardAnnotations()
  );
  const [composeRecordMoves, setComposeRecordMoves] = useState(false);
  const [composeMoveUcis, setComposeMoveUcis] = useState<string[]>([]);
  const [composeRecordStartFen, setComposeRecordStartFen] = useState(DEFAULT_START_FEN);
  const [busyCreate, setBusyCreate] = useState(false);
  const [sort, setSort] = useState("new");
  const TITLE_MAX_LENGTH = 200;
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadPosts = async (append = false) => {
    if (append) setLoadingMore(true);
    else setLoadingPosts(true);
    setPostsError(null);
    try {
      const isRankSort = sort === "likes" || sort === "comments";
      const data = await fetchForumPosts({
        sort,
        limit: pageSize,
        q: searchQuery.trim() || undefined,
        cursor: append && !isRankSort ? nextCursor : undefined,
        page: append && isRankSort ? nextPage : undefined,
      });
      const items = data.items ?? [];
      setPosts((prev) => (append ? [...prev, ...items] : items));
      setNextCursor(data.next_cursor ?? null);
      setNextPage(data.next_page ?? null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setPostsError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : t("forum.error.loadList")
      );
    } finally {
      setLoadingPosts(false);
      setLoadingMore(false);
    }
  };

  const loadMe = async () => {
    if (status !== "authenticated") {
      setCanWrite(false);
      setMeError(null);
      return;
    }

    setLoadingMe(true);
    setMeError(null);
    try {
      const token = await getBackendJwt();
      if (!token) {
        setCanWrite(false);
        setMeError(t("forum.error.backendJwt"));
        return;
      }
      const canWrite = await fetchMyWritePermission(token);
      setCanWrite(canWrite);
    } catch (e: unknown) {
      setCanWrite(false);
      const err = e as { response?: { data?: { detail?: string } } };
      setMeError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : t("forum.error.meLoad")
      );
    } finally {
      setLoadingMe(false);
    }
  };

  useEffect(() => {
    void loadPosts(false);
  }, [sort, searchQuery, pageSize]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = () => setIsDesktop(desktopQuery.matches);
    syncDesktop();
    desktopQuery.addEventListener("change", syncDesktop);
    return () => desktopQuery.removeEventListener("change", syncDesktop);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [status]);

  const composePeekFen = useMemo(() => {
    if (!chessImported) return null;
    if (composeRecordMoves) {
      return fenAfterUcis(composeRecordStartFen, composeMoveUcis) ?? normalizeFenForDisplay(composeRecordStartFen);
    }
    return composerPreviewFen(createBoardFen);
  }, [chessImported, composeRecordMoves, composeRecordStartFen, composeMoveUcis, createBoardFen]);

  const composeSanList = useMemo(
    () => sanListFromStartAndUcis(composeRecordStartFen, composeMoveUcis),
    [composeRecordStartFen, composeMoveUcis]
  );

  const importBoard = () => {
    setChessImported(true);
    setBoardOverlayOpen(true);
    setComposeRecordMoves(false);
    setComposeMoveUcis([]);
    setComposeRecordStartFen(DEFAULT_START_FEN);
    setComposeBoardAnnotations(emptyBoardAnnotations());
  };

  const removeBoard = () => {
    setChessImported(false);
    setBoardOverlayOpen(false);
    setCreateBoardFen(DEFAULT_START_FEN);
    setComposeRecordMoves(false);
    setComposeMoveUcis([]);
    setComposeRecordStartFen(DEFAULT_START_FEN);
    setComposeBoardAnnotations(emptyBoardAnnotations());
  };

  const closeBoardOverlay = () => {
    setBoardOverlayOpen(false);
  };

  const onOverlayBoardFen = (f: string) => {
    setCreateBoardFen(f);
  };

  const onCreatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!canWrite || busyCreate) return;
    if (!createTitle.trim() || !createBody.trim()) {
      setPostsError(t("forum.error.titleBodyRequired"));
      return;
    }
    if (createTitle.trim().length > TITLE_MAX_LENGTH) {
      setPostsError(t("forum.error.titleTooLong"));
      return;
    }
    setBusyCreate(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error(t("forum.error.noLoginToken"));
      let fen_initial: string | null = null;
      let pgn_text: string | null = null;
      let board_annotations = null;
      if (chessImported) {
        board_annotations = boardAnnotationsToPayload(composeBoardAnnotations);
        if (composeMoveUcis.length > 0) {
          const pgn = buildPgnFromStartAndUcis(composeRecordStartFen, composeMoveUcis);
          if (!pgn) {
            setPostsError(t("forum.error.pgnBuildFailed"));
            return;
          }
          pgn_text = pgn;
          fen_initial = composeRecordStartFen.trim() || null;
        } else {
          pgn_text = null;
          const fenSrc = composeRecordMoves ? composeRecordStartFen : createBoardFen;
          fen_initial = fenSrc.trim() || null;
        }
      }
      const { data } = await api.post(
        "/forum/posts",
        {
          title: createTitle.trim(),
          body: createBody,
          pgn_text,
          fen_initial,
          board_annotations,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      resetComposeState({
        setCreateTitle,
        setCreateBody,
        setCreateBoardFen,
        setChessImported,
        setBoardOverlayOpen,
        setComposeBoardSectionExpanded,
        setComposeBoardAnnotations,
        setComposeRecordMoves,
        setComposeMoveUcis,
        setComposeRecordStartFen,
      });
      setCreating(false);
      await loadPosts(false);
      const slug = (data as { public_id?: string; id?: string })?.public_id ?? data?.id;
      if (slug) {
        router.push(`/forum/${slug}`);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      const msg = typeof d === "string" ? d : err?.message ?? t("forum.error.createFailed");
      setPostsError(msg);
    } finally {
      setBusyCreate(false);
    }
  };

  const closeCompose = () => {
    setCreating(false);
    resetComposeState({
      setCreateTitle,
      setCreateBody,
      setCreateBoardFen,
      setChessImported,
      setBoardOverlayOpen,
      setComposeBoardSectionExpanded,
      setComposeBoardAnnotations,
      setComposeRecordMoves,
      setComposeMoveUcis,
      setComposeRecordStartFen,
    });
  };

  const inputClass =
    "w-full pixel-input px-4 py-3 text-sm text-chess-primary placeholder:text-chess-muted/70 dark:bg-chess-elevated/50";
  const hasMore = Boolean(nextCursor || nextPage);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchDraft.trim());
  };

  return (
    <section className="space-y-6">
      <div className="flex w-full flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="w-full min-w-0 md:flex-1">
          {creating && canWrite && (
            <>
              <h2 className="text-2xl font-semibold tracking-tight text-chess-primary">{t("forum.compose.title")}</h2>
              <p className="mt-1 text-sm text-chess-muted">{t("forum.compose.hint")}</p>
            </>
          )}
          {!creating && (
            <div className="mt-0 flex w-full flex-col gap-3 text-sm text-chess-muted md:mt-3 md:flex-row md:flex-wrap md:items-end md:gap-4">
              <label className="flex w-full flex-col gap-1 md:w-auto md:flex-row md:items-center md:gap-2">
                <span className="shrink-0 text-xs font-medium md:text-sm">{t("board.sort.label")}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="pixel-input min-h-[44px] w-full px-3 py-2.5 text-base text-chess-primary md:min-h-0 md:w-auto md:min-w-[10rem] md:text-sm"
                >
                  <option value="new">{t("board.sort.new")}</option>
                  <option value="old">{t("board.sort.old")}</option>
                  <option value="likes">{t("board.sort.likes")}</option>
                  <option value="comments">{t("board.sort.comments")}</option>
                </select>
              </label>
              <form
                onSubmit={onSearchSubmit}
                className="flex w-full min-w-0 flex-row items-stretch gap-2 md:w-auto md:max-w-xl md:flex-1"
              >
                <input
                  type="search"
                  enterKeyHint="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={t("forum.search.placeholder")}
                  className="pixel-input min-h-[44px] min-w-0 flex-1 px-3 py-2.5 text-base text-chess-primary md:min-w-[12rem] md:text-sm"
                />
                <button
                  type="submit"
                  className="font-pixel pixel-btn min-h-[44px] shrink-0 px-4 py-2.5 text-sm bg-chess-surface/80 text-chess-primary md:min-h-0"
                >
                  {t("board.search.submit")}
                </button>
              </form>
            </div>
          )}
        </div>
        {sessionLoading ? (
          <p className="font-pixel text-xs text-chess-muted md:self-end">{t("forum.checkingAccount")}</p>
        ) : canWrite ? (
          <button
            type="button"
            onClick={() => {
              if (creating) closeCompose();
              else setCreating(true);
            }}
            className="font-pixel pixel-btn inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 bg-chess-accent px-4 py-2.5 text-sm font-semibold text-white border-chess-accent hover:brightness-105 md:w-auto md:min-w-[8.5rem]"
          >
            {creating ? (
              t("board.write.close")
            ) : (
              <>
                <PenLine className="size-4 opacity-90" aria-hidden />
                {t("forum.newPost")}
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={sessionLoading}
            onClick={() => {
              if (status !== "authenticated") {
                router.push("/api/auth/signin?callbackUrl=%2Fpost-login");
              } else {
                router.push("/signup/consent");
              }
            }}
            className="font-pixel pixel-btn min-h-[44px] w-full shrink-0 bg-chess-surface/70 px-4 py-2.5 text-sm font-medium text-chess-primary hover:bg-chess-elevated/80 disabled:opacity-50 md:w-auto"
          >
            {status === "authenticated" ? t("board.write.afterProfile") : t("board.write.afterSignIn")}
          </button>
        )}
      </div>
      {meError && (
        <p className="pixel-frame border-amber-600/45 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {meError}
        </p>
      )}
      {loadingMe && status === "authenticated" && (
        <p className="text-sm text-chess-muted">{t("forum.checkingAccount")}</p>
      )}
      {loadingPosts && <p className="text-sm text-chess-muted">{t("forum.listLoading")}</p>}
      {postsError && <p className="text-sm text-red-600 dark:text-red-400">{postsError}</p>}

      {creating && canWrite && (
        <form
          onSubmit={onCreatePost}
          className="overflow-hidden pixel-frame bg-chess-surface/80 dark:bg-chess-surface/35"
        >
          <div className="border-b border-chess-border/50 bg-chess-elevated/25 px-5 py-4 dark:bg-chess-elevated/20">
            <p className="text-xs font-medium uppercase tracking-wider text-chess-muted">{t("forum.titleLabel")}</p>
            <input
              type="text"
              required
              minLength={1}
              maxLength={TITLE_MAX_LENGTH}
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder={t("forum.titlePlaceholder")}
              className={`mt-2 ${inputClass} text-base font-medium`}
            />
          </div>

          <div className="space-y-4 px-5 py-5">
            <div>
              <label htmlFor="forum-compose-body" className="text-xs font-medium uppercase tracking-wider text-chess-muted">
                {t("forum.body")}
              </label>
              <div className="mt-2 flex w-full flex-col items-center">
                <button
                  type="button"
                  onClick={() => setComposeBoardSectionExpanded((v) => !v)}
                  aria-expanded={composeBoardSectionExpanded}
                  className="mb-2 flex w-full max-w-[15rem] items-center justify-center gap-2 pixel-btn bg-chess-surface/55 py-2 text-xs font-medium text-chess-primary hover:bg-chess-elevated/60 dark:bg-chess-elevated/25"
                >
                  {composeBoardSectionExpanded ? (
                    <ChevronUp className="size-4 shrink-0 text-chess-muted" aria-hidden />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-chess-muted" aria-hidden />
                  )}
                  {t("forum.thumbnailBoard")}{" "}
                  {composeBoardSectionExpanded ? t("forum.collapse") : t("forum.expand")}
                </button>
                {composeBoardSectionExpanded && (
                  <div className="flex w-full flex-col items-center">
                    <ForumBoardPeekCard
                      imported={chessImported}
                      previewFen={composePeekFen}
                      onActivate={() => (chessImported ? setBoardOverlayOpen(true) : importBoard())}
                    />
                    {chessImported && composeMoveUcis.length > 0 && (
                      <div className="mb-2 flex w-full max-w-md flex-col items-center gap-1">
                        <ForumRecordedMoveChips
                          sanList={composeSanList}
                          onDeleteFromChipIndex={(keep) => {
                            const nextUcis = composeMoveUcis.slice(0, keep);
                            setComposeMoveUcis(nextUcis);
                            setComposeBoardAnnotations((a) => pruneAnnotationsBeyondPly(a, keep === 0 ? -1 : keep));
                            const nf = fenAfterUcis(composeRecordStartFen, nextUcis);
                            if (nf) setCreateBoardFen(nf);
                          }}
                          active={composeRecordMoves}
                        />
                      </div>
                    )}
                    {chessImported && (
                      <button
                        type="button"
                        onClick={removeBoard}
                        className="-mt-1 mb-2 text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                      >
                        {t("forum.removeBoard")}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <textarea
                id="forum-compose-body"
                minLength={1}
                maxLength={50000}
                rows={14}
                value={createBody}
                onChange={(e) => setCreateBody(e.target.value)}
                placeholder={t("forum.bodyPlaceholder")}
                className={`mt-2 ${inputClass} min-h-[12rem] resize-y break-words leading-relaxed [overflow-wrap:anywhere]`}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-chess-border/50 bg-chess-surface/40 px-5 py-4 sm:flex-row sm:justify-end dark:bg-chess-elevated/15">
            <button
              type="button"
              onClick={closeCompose}
              className="font-pixel pixel-btn px-5 py-3 text-sm font-medium text-chess-primary hover:bg-chess-elevated/50"
            >
              {t("settings.cancel")}
            </button>
            <button
              type="submit"
              disabled={busyCreate}
              className="font-pixel pixel-btn inline-flex items-center justify-center gap-2 bg-chess-accent px-6 py-3 text-sm font-semibold text-white border-chess-accent enabled:hover:brightness-105 disabled:opacity-50"
            >
              {busyCreate ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("forum.publishing")}
                </>
              ) : (
                t("forum.publishDone")
              )}
            </button>
          </div>
        </form>
      )}

      {creating && canWrite && chessImported && (
        <ForumBoardEditOverlay
          open={boardOverlayOpen}
          onClose={closeBoardOverlay}
          boardFen={createBoardFen}
          recordStartFen={composeRecordStartFen}
          onBoardFenChange={onOverlayBoardFen}
          onDeleteBoard={removeBoard}
          busy={busyCreate}
          inputClassName={inputClass}
          annotations={composeBoardAnnotations}
          onAnnotationsChange={setComposeBoardAnnotations}
          recordMoves={composeRecordMoves}
          onRecordMovesChange={setComposeRecordMoves}
          moveUcis={composeMoveUcis}
          onMoveUcisChange={setComposeMoveUcis}
          onRecordStartFenChange={setComposeRecordStartFen}
        />
      )}

      <div className="pixel-frame bg-chess-surface/30 p-3 sm:p-4 dark:bg-chess-surface/22">
        {!loadingPosts && !postsError && posts.length === 0 && (
          <div className="mb-4 pixel-frame border-dashed border-chess-border/80 bg-chess-bg/55 px-3 py-8 text-center dark:bg-chess-elevated/20">
            <p className="text-sm font-medium text-chess-primary">{t("forum.empty.none")}</p>
            <p className="mt-1 text-sm text-chess-muted">
              {canWrite && !creating ? t("forum.empty.hintAuthor") : t("forum.empty.hintWait")}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5 [grid-template-columns:repeat(2,minmax(0,1fr))] sm:grid-cols-3 sm:[grid-template-columns:repeat(3,minmax(0,1fr))] sm:gap-3 lg:grid-cols-4 lg:[grid-template-columns:repeat(4,minmax(0,1fr))]">
          {posts.map((p) => (
            <article
              key={p.id}
              className="group flex min-h-0 min-w-0 flex-col overflow-hidden pixel-frame bg-chess-bg/85 transition-colors hover:border-chess-accent/50 dark:bg-chess-surface/40"
            >
              <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-chess-surface">
                {isForumPgnReplayable(p.pgn_text) ? (
                  <ForumPgnReplay variant="card" pgnText={p.pgn_text!} postHref={forumPostHref(p)} />
                ) : (
                  <Link
                    href={forumPostHref(p)}
                    className="absolute inset-0 block min-h-0 min-w-0"
                    aria-label={t("forum.aria.openPostFromThumbnail")}
                  >
                    <ForumPostThumbnail
                      thumbnailFen={p.thumbnail_fen?.trim() ? p.thumbnail_fen : null}
                      compactNotation
                      nonInteractive
                    />
                  </Link>
                )}
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-3">
                <h3 className="min-w-0 max-w-full overflow-hidden text-base font-semibold leading-snug tracking-tight text-chess-primary sm:text-lg">
                  <Link
                    href={forumPostHref(p)}
                    className="block min-w-0 max-w-full overflow-hidden no-underline transition group-hover:text-chess-accent"
                  >
                    <span className="line-clamp-2 w-full min-w-0 max-w-full break-all [overflow-wrap:anywhere] [word-break:break-word]">
                      {p.title}
                    </span>
                  </Link>
                </h3>
                <p className="mt-2 line-clamp-2 flex-1 overflow-hidden break-all text-sm leading-relaxed text-chess-muted [overflow-wrap:anywhere] sm:line-clamp-3 sm:break-words sm:text-[1.05rem] lg:line-clamp-4">
                  {p.body_preview}
                </p>
                <div
                  className="mt-3 min-w-0 text-sm leading-relaxed text-chess-muted/90 sm:text-base"
                  title={`${p.author.display_name} · ${formatPostDate(p.created_at, language)}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <AuthorNameLink
                      author={p.author}
                      avatarSize={24}
                      className="min-w-0 max-w-[min(100%,14rem)] text-sm font-medium text-chess-primary hover:text-chess-accent hover:underline underline-offset-2 sm:text-base"
                    />
                    <span className="shrink-0 tabular-nums text-sm text-chess-muted/85 sm:text-base">
                      {formatPostDate(p.created_at, language)}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm tabular-nums sm:text-base">
                    <span
                      className="inline-flex items-center gap-1"
                      aria-label={t("forum.aria.likes").replace("{n}", String(p.like_count))}
                    >
                      <PixelHeartGlyph className="text-red-500 dark:text-red-400" size={16} />
                      {p.like_count}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      aria-label={t("forum.aria.comments").replace("{n}", String(p.comment_count))}
                    >
                      <PixelChatGlyph size={16} />
                      {p.comment_count}
                    </span>
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!loadingPosts && !postsError && hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadPosts(true)}
              disabled={loadingMore}
              className="font-pixel pixel-btn px-4 py-2 text-sm bg-chess-surface/80 text-chess-primary disabled:opacity-50"
            >
              {loadingMore ? t("forum.loadMoreBusy") : t("forum.loadMore")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
