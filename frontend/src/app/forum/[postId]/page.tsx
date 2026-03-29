"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { notFound, useParams, usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import ForumBoardEditOverlay from "@/app/forum/ForumBoardEditOverlay";
import ForumBoardPeekCard from "@/app/forum/ForumBoardPeekCard";
import ForumPostThumbnail from "@/app/forum/ForumPostThumbnail";
import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { composerPreviewFen, DEFAULT_START_FEN, getFinalFenFromPgn } from "@/shared/lib/forumChess";
import { AuthorNameLink } from "@/shared/components/forum/AuthorName";
import { PixelHeartGlyph } from "@/shared/components/ui/PixelGlyphs";
import {
  freeDetailBadgeClass,
  noticeDetailBadgeClass,
  patchDetailBadgeClass,
} from "@/shared/components/forum/boardPostBadges";
import { ReportModal } from "@/shared/components/forum/ReportModal";
import { apiErrorDetail } from "@/shared/lib/apiErrorDetail";
import { useTranslation } from "@/shared/lib/i18n";
import { formatPostDateTime } from "@/shared/lib/formatLocaleDate";

function isForumAdminAuthor(role?: string | null) {
  return (role ?? "").toLowerCase().trim() === "admin";
}

type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  can_edit?: boolean;
  author: { id: string; public_id: string; display_name: string; role?: string; avatar_url?: string | null };
};

type PostDetail = {
  id: string;
  public_id: string;
  title: string;
  body: string;
  pgn_text: string | null;
  fen_initial: string | null;
  board_category?: string | null;
  author: { id: string; public_id: string; display_name: string; role?: string; avatar_url?: string | null };
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  can_edit: boolean;
  comments: CommentItem[];
};

const inputClass =
  "w-full pixel-input px-4 py-3 text-sm text-chess-primary placeholder:text-chess-muted/70 dark:bg-chess-elevated/50";

export default function ForumPostDetailPage() {
  const COMMENT_PAGE_SIZE = 10;
  const params = useParams<{ postId: string }>();
  const postId = params?.postId;
  const router = useRouter();
  const pathname = usePathname();
  const isBoardPath = pathname?.startsWith("/board");
  const listBasePath = isBoardPath ? "/board" : "/forum";
  const { status } = useSession();
  const sessionLoading = status === "loading";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [editing, setEditing] = useState(false);
  const TITLE_MAX_LENGTH = 200;
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editFen, setEditFen] = useState(DEFAULT_START_FEN);
  const [chessImported, setChessImported] = useState(false);
  const [boardOverlayOpen, setBoardOverlayOpen] = useState(false);
  const [editBoardSectionExpanded, setEditBoardSectionExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<"post" | { type: "comment"; id: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportSubmittedFlash, setReportSubmittedFlash] = useState(false);
  const [commentPage, setCommentPage] = useState(1);
  const reportFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t, language } = useTranslation();

  const load = async () => {
    if (!postId) return;
    try {
      setLoading(true);
      const token = await getBackendJwt();
      const { data } = await api.get<PostDetail>(`/forum/posts/${postId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (isBoardPath && !data.board_category) {
        notFound();
      }
      if (!isBoardPath && data.board_category) {
        router.replace(`/board/${data.public_id || data.id}`);
        return;
      }
      setPost(data);
      setEditTitle(data.title);
      setEditBody(data.body);
      setEditFen(data.fen_initial?.trim() || getFinalFenFromPgn(data.pgn_text) || DEFAULT_START_FEN);
      setError(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? t("forum.error.loadPost"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [postId, isBoardPath, router]);

  const displayFen = useMemo(() => {
    if (!post || post.board_category) return null;
    return getFinalFenFromPgn(post.pgn_text) ?? post.fen_initial ?? null;
  }, [post]);

  const getRequiredToken = async () => {
    const token = await getBackendJwt();
    if (!token) {
      router.push("/api/auth/signin?callbackUrl=%2Fpost-login");
      throw new Error(t("forum.error.loginRequired"));
    }
    return token;
  };

  useEffect(() => {
    const loadMe = async () => {
      if (status !== "authenticated") {
        setMyUserId(null);
        return;
      }
      try {
        const token = await getBackendJwt();
        if (!token) return;
        const { data } = await api.get<{ id?: string }>("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMyUserId((data?.id as string | undefined) ?? null);
      } catch {
        setMyUserId(null);
      }
    };
    void loadMe();
  }, [status]);

  useEffect(() => {
    return () => {
      if (reportFlashTimerRef.current) clearTimeout(reportFlashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setCommentPage(1);
  }, [post?.id, post?.comments.length]);

  const comments = post?.comments ?? [];
  const commentsPageCount = Math.max(1, Math.ceil(comments.length / COMMENT_PAGE_SIZE));
  const pagedComments = comments.slice((commentPage - 1) * COMMENT_PAGE_SIZE, commentPage * COMMENT_PAGE_SIZE);

  const onToggleLike = async () => {
    if (!post) return;
    setBusy(true);
    try {
      const token = await getRequiredToken();
      if (post.liked_by_me) {
        await api.delete(`/forum/posts/${post.id}/like`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await api.post(
          `/forum/posts/${post.id}/like`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? t("forum.error.likeFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!post) return;
    setBusy(true);
    try {
      const token = await getRequiredToken();
      await api.post(
        `/forum/posts/${post.id}/comments`,
        { body: commentBody },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCommentBody("");
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? t("forum.error.commentCreateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteComment = async (commentId: string) => {
    setBusy(true);
    try {
      const token = await getRequiredToken();
      await api.delete(`/forum/comments/${commentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? t("forum.error.commentDeleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const beginEditComment = (c: CommentItem) => {
    setEditingCommentId(c.id);
    setEditCommentBody(c.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentBody("");
  };

  const onSaveComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCommentId) return;
    setBusy(true);
    try {
      const token = await getRequiredToken();
      await api.patch(
        `/forum/comments/${editingCommentId}`,
        { body: editCommentBody },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      cancelEditComment();
      await load();
    } catch (e: unknown) {
      setError(apiErrorDetail(e));
    } finally {
      setBusy(false);
    }
  };

  const openReportPost = () => {
    setReportTarget("post");
    setReportOpen(true);
  };

  const openReportComment = (commentId: string) => {
    setReportTarget({ type: "comment", id: commentId });
    setReportOpen(true);
  };

  const onReportSubmit = async (reason: string) => {
    if (!post || !reportTarget) return;
    setReportBusy(true);
    setError(null);
    try {
      const token = await getRequiredToken();
      const body =
        reportTarget === "post"
          ? { post_id: post.id, comment_id: undefined, reason }
          : { post_id: undefined, comment_id: reportTarget.id, reason };
      await api.post("/forum/reports", body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportOpen(false);
      setReportTarget(null);
      setReportSubmittedFlash(true);
      if (reportFlashTimerRef.current) clearTimeout(reportFlashTimerRef.current);
      reportFlashTimerRef.current = setTimeout(() => {
        reportFlashTimerRef.current = null;
        setReportSubmittedFlash(false);
      }, 4500);
      await load();
    } catch (e: unknown) {
      setError(apiErrorDetail(e));
      throw e;
    } finally {
      setReportBusy(false);
    }
  };

  const onOverlayBoardFen = (f: string) => {
    setEditFen(f);
  };

  const beginEdit = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditBody(post.body);
    if (post.board_category) {
      setEditFen(DEFAULT_START_FEN);
      setChessImported(false);
    } else {
      setEditFen(post.fen_initial?.trim() || getFinalFenFromPgn(post.pgn_text) || DEFAULT_START_FEN);
      setChessImported(Boolean(post.pgn_text?.trim() || post.fen_initial?.trim()));
    }
    setBoardOverlayOpen(false);
    setEditBoardSectionExpanded(true);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setBoardOverlayOpen(false);
    setEditBoardSectionExpanded(true);
  };

  const onUpdatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!post) return;
    if (!editTitle.trim() || !editBody.trim()) {
      setError(t("forum.error.titleBodyRequired"));
      return;
    }
    if (editTitle.trim().length > TITLE_MAX_LENGTH) {
      setError(t("forum.error.titleTooLong"));
      return;
    }
    setBusy(true);
    try {
      const token = await getRequiredToken();
      await api.patch(
        `/forum/posts/${post.id}`,
        {
          title: editTitle.trim(),
          body: editBody,
          pgn_text: "",
          fen_initial: post.board_category ? "" : chessImported ? editFen.trim() || "" : "",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditing(false);
      setBoardOverlayOpen(false);
      setEditBoardSectionExpanded(true);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? t("forum.error.updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const importBoard = () => {
    setChessImported(true);
    setBoardOverlayOpen(true);
  };

  const removeBoard = () => {
    setChessImported(false);
    setBoardOverlayOpen(false);
    setEditFen(DEFAULT_START_FEN);
  };

  const onDeletePost = async () => {
    if (!post) return;
    setBusy(true);
    try {
      const token = await getRequiredToken();
      await api.delete(`/forum/posts/${post.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      router.push(post.board_category ? "/board" : listBasePath);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? t("forum.error.deleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <Link
          href={post?.board_category ? "/board" : listBasePath}
          className="text-sm text-chess-accent hover:underline"
        >
          {post?.board_category ? t("forum.backToBoard") : t("forum.backToForum")}
        </Link>
      </div>
      {loading && <p className="text-chess-muted">{t("forum.loadingShort")}</p>}
      {error && <p className="text-red-500">{error}</p>}
      {post && (
        <>
          {reportSubmittedFlash && (
            <div
              className="pixel-frame border-chess-win/35 bg-chess-win/10 px-4 py-3 text-sm text-chess-primary dark:text-chess-primary"
              role="status"
            >
              {t("forum.reportSubmitted")}
            </div>
          )}
          {editing ? (
            <form
              onSubmit={onUpdatePost}
              className="overflow-hidden pixel-frame bg-chess-surface/80 dark:bg-chess-surface/35"
            >
              <div className="border-b border-chess-border/50 bg-chess-elevated/25 px-5 py-4 dark:bg-chess-elevated/20">
                <p className="text-xs font-medium uppercase tracking-wider text-chess-muted">{t("forum.titleLabel")}</p>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={TITLE_MAX_LENGTH}
                  className={`mt-2 ${inputClass} text-base font-medium leading-relaxed [overflow-wrap:anywhere]`}
                />
              </div>

              <div className="space-y-4 px-5 py-5">
                <div>
                  <label htmlFor="forum-edit-body" className="text-xs font-medium uppercase tracking-wider text-chess-muted">
                    {t("forum.body")}
                  </label>
                  {!post.board_category && (
                    <div className="mt-2 flex w-full flex-col items-center">
                      <button
                        type="button"
                        onClick={() => setEditBoardSectionExpanded((v) => !v)}
                        aria-expanded={editBoardSectionExpanded}
                        className="mb-2 flex w-full max-w-[15rem] items-center justify-center gap-2 pixel-btn bg-chess-surface/55 py-2 text-xs font-medium text-chess-primary hover:bg-chess-elevated/60 dark:bg-chess-elevated/25"
                      >
                        {editBoardSectionExpanded ? (
                          <ChevronUp className="size-4 shrink-0 text-chess-muted" aria-hidden />
                        ) : (
                          <ChevronDown className="size-4 shrink-0 text-chess-muted" aria-hidden />
                        )}
                        {t("forum.thumbnailBoard")}{" "}
                        {editBoardSectionExpanded ? t("forum.collapse") : t("forum.expand")}
                      </button>
                      {editBoardSectionExpanded && (
                        <div className="flex w-full flex-col items-center">
                          <ForumBoardPeekCard
                            imported={chessImported}
                            previewFen={composerPreviewFen(editFen)}
                            onActivate={() => (chessImported ? setBoardOverlayOpen(true) : importBoard())}
                          />
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
                  )}
                  <textarea
                    id="forum-edit-body"
                    required
                    rows={12}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className={`mt-2 ${inputClass} min-h-[10rem] resize-y break-words leading-relaxed [overflow-wrap:anywhere]`}
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-chess-border/50 bg-chess-surface/40 px-5 py-4 sm:flex-row sm:justify-end dark:bg-chess-elevated/15">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="font-pixel pixel-btn px-5 py-3 text-sm font-medium text-chess-primary hover:bg-chess-elevated/50"
                >
                  {t("settings.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="font-pixel pixel-btn inline-flex items-center justify-center gap-2 bg-chess-accent px-6 py-3 text-sm font-semibold text-white border-chess-accent enabled:hover:brightness-105 disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t("forum.saving")}
                    </>
                  ) : (
                    t("forum.save")
                  )}
                </button>
              </div>
            </form>
          ) : (
            <article className="pixel-frame p-4">
              {post.board_category === "notice" && (
                <p className={noticeDetailBadgeClass}>{t("board.badge.notice")}</p>
              )}
              {post.board_category === "patch" && (
                <p className={patchDetailBadgeClass}>{t("board.tab.patch")}</p>
              )}
              {post.board_category === "free" && (
                <p className={freeDetailBadgeClass}>{t("board.tab.free")}</p>
              )}
              <h1 className="break-words text-2xl font-bold text-chess-primary [overflow-wrap:anywhere] sm:text-3xl">
                {post.title}
              </h1>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-chess-muted sm:text-base">
                <AuthorNameLink
                  author={post.author}
                  avatarSize={32}
                  className="min-w-0 font-semibold text-chess-primary hover:text-chess-accent hover:underline underline-offset-2 sm:text-lg"
                />
                <span className="shrink-0 tabular-nums opacity-90">
                  · {formatPostDateTime(post.created_at, language)}
                </span>
              </div>
              {displayFen && (
                <div className="relative mx-auto mt-6 aspect-square w-full max-w-xs overflow-hidden pixel-frame bg-chess-surface sm:max-w-sm">
                  <ForumPostThumbnail thumbnailFen={displayFen} />
                </div>
              )}
              <p className="mt-4 whitespace-pre-wrap break-words text-base leading-relaxed text-chess-primary [overflow-wrap:anywhere] sm:text-[1.05rem]">
                {post.body}
              </p>
              {post.pgn_text?.trim() && !post.board_category && (
                <div className="mt-4 pixel-frame bg-chess-surface/45 p-3">
                  <p className="text-xs font-medium text-chess-muted">{t("forum.pgnLabel")}</p>
                  <pre className="mt-2 max-h-48 overflow-auto break-words whitespace-pre-wrap font-mono text-xs text-chess-primary [overflow-wrap:anywhere]">
                    {post.pgn_text}
                  </pre>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || sessionLoading || status !== "authenticated"}
                  onClick={onToggleLike}
                  aria-label={
                    post.liked_by_me
                      ? t("forum.aria.unlikeCount").replace("{n}", String(post.like_count))
                      : t("forum.aria.likeCount").replace("{n}", String(post.like_count))
                  }
                  className="font-pixel pixel-btn px-3 py-2 text-sm tabular-nums disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <PixelHeartGlyph className="text-red-500 dark:text-red-400" size={15} />
                  {post.like_count}
                </button>
                {post.can_edit && (
                  <>
                    <button
                      type="button"
                      onClick={beginEdit}
                      className="font-pixel pixel-btn px-3 py-2 text-sm"
                    >
                      {t("forum.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={onDeletePost}
                      className="font-pixel pixel-btn border-red-500/60 px-3 py-2 text-sm text-red-500"
                    >
                      {t("forum.delete")}
                    </button>
                  </>
                )}
                {status === "authenticated" &&
                  myUserId &&
                  post.author.id !== myUserId &&
                  !isForumAdminAuthor(post.author.role) && (
                    <button
                      type="button"
                      onClick={openReportPost}
                      className="font-pixel pixel-btn px-3 py-2 text-sm text-chess-muted"
                    >
                      {t("forum.reportShort")}
                    </button>
                  )}
              </div>
            </article>
          )}

          {editing && chessImported && !post.board_category && (
            <ForumBoardEditOverlay
              open={boardOverlayOpen}
              onClose={() => setBoardOverlayOpen(false)}
              boardFen={editFen}
              onBoardFenChange={onOverlayBoardFen}
              onDeleteBoard={removeBoard}
              busy={busy}
              inputClassName={inputClass}
              ariaTitleId="forum-board-overlay-title-edit"
            />
          )}

          <section className="pixel-frame p-4">
            <h2 className="text-lg font-semibold">
              {t("forum.commentsWithCount").replace("{n}", String(post.comment_count))}
            </h2>
            <form onSubmit={onAddComment} className="mt-3 space-y-2">
              {sessionLoading && (
                <p className="text-xs text-chess-muted">{t("forum.checkingAccount")}</p>
              )}
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                required
                rows={3}
                placeholder={t("forum.commentPlaceholder")}
                disabled={sessionLoading || status !== "authenticated"}
                className="w-full pixel-input px-3 py-2 text-sm break-words [overflow-wrap:anywhere] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || sessionLoading || status !== "authenticated"}
                className="font-pixel pixel-btn bg-chess-accent px-4 py-2 text-sm font-semibold text-white border-chess-accent disabled:opacity-50"
              >
                {t("forum.commentPost")}
              </button>
            </form>
            <div className="mt-4 space-y-3">
              {pagedComments.map((c) => (
                <article key={c.id} className="pixel-frame p-3">
                  {editingCommentId === c.id ? (
                    <form onSubmit={onSaveComment} className="space-y-2">
                      <textarea
                        value={editCommentBody}
                        onChange={(e) => setEditCommentBody(e.target.value)}
                        required
                        minLength={1}
                        maxLength={10000}
                        rows={3}
                        className="w-full pixel-input px-3 py-2 text-sm break-words [overflow-wrap:anywhere]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={busy}
                          className="font-pixel pixel-btn bg-chess-accent px-3 py-1 text-xs font-semibold text-white border-chess-accent disabled:opacity-50"
                        >
                          {t("forum.save")}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditComment}
                          className="font-pixel pixel-btn px-3 py-1 text-xs"
                        >
                          {t("settings.cancel")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm text-chess-primary [overflow-wrap:anywhere]">
                      {c.body}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-chess-muted sm:text-base">
                      <AuthorNameLink
                        author={c.author}
                        avatarSize={26}
                        className="min-w-0 font-semibold text-chess-primary hover:text-chess-accent hover:underline underline-offset-2 sm:text-lg"
                      />
                      <span className="shrink-0 tabular-nums opacity-90">
                        · {formatPostDateTime(c.created_at, language)}
                      </span>
                    </div>
                    {editingCommentId !== c.id && status === "authenticated" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {c.can_edit && (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEditComment(c)}
                              className="text-xs text-chess-accent hover:underline"
                            >
                              {t("forum.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteComment(c.id)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              {t("forum.delete")}
                            </button>
                          </>
                        )}
                        {myUserId && c.author.id !== myUserId && !isForumAdminAuthor(c.author.role) && (
                          <button
                            type="button"
                            onClick={() => openReportComment(c.id)}
                            className="text-xs text-chess-muted hover:underline"
                          >
                            {t("forum.reportShort")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {comments.length > COMMENT_PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCommentPage((prev) => Math.max(1, prev - 1))}
                  disabled={commentPage === 1}
                  className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {t("forum.pagination.prev")}
                </button>
                <span className="font-pixel text-xs text-chess-muted tabular-nums">
                  {commentPage} / {commentsPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setCommentPage((prev) => Math.min(commentsPageCount, prev + 1))}
                  disabled={commentPage === commentsPageCount}
                  className="font-pixel pixel-btn px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {t("forum.pagination.next")}
                </button>
              </div>
            )}
          </section>

          <ReportModal
            open={reportOpen && reportTarget !== null}
            title={reportTarget === "post" ? t("forum.reportPostTitle") : t("forum.reportCommentTitle")}
            busy={reportBusy}
            onClose={() => {
              setReportOpen(false);
              setReportTarget(null);
            }}
            onSubmit={onReportSubmit}
          />
        </>
      )}
    </section>
  );
}
