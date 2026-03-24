"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import ForumBoardEditOverlay from "@/app/forum/ForumBoardEditOverlay";
import ForumBoardPeekCard from "@/app/forum/ForumBoardPeekCard";
import ForumPostThumbnail from "@/app/forum/ForumPostThumbnail";
import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { composerPreviewFen, DEFAULT_START_FEN, getFinalFenFromPgn } from "@/shared/lib/forumChess";
import { AuthorNameLink } from "@/shared/components/forum/AuthorName";
import {
  freeDetailBadgeClass,
  noticeDetailBadgeClass,
  patchDetailBadgeClass,
} from "@/shared/components/forum/boardPostBadges";
import { ReportModal } from "@/shared/components/forum/ReportModal";
import { apiErrorDetail } from "@/shared/lib/apiErrorDetail";

type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  can_edit?: boolean;
  author: { id: string; public_id: string; display_name: string; role?: string };
};

type PostDetail = {
  id: string;
  public_id: string;
  title: string;
  body: string;
  pgn_text: string | null;
  fen_initial: string | null;
  board_category?: string | null;
  author: { id: string; public_id: string; display_name: string; role?: string };
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  can_edit: boolean;
  comments: CommentItem[];
};

const inputClass =
  "w-full rounded-xl border border-chess-border/90 bg-chess-bg px-4 py-3 text-sm text-chess-primary shadow-inner shadow-black/[0.02] outline-none transition-[border-color,box-shadow] placeholder:text-chess-muted/70 focus:border-chess-accent/50 focus:ring-2 focus:ring-chess-accent/20 dark:border-chess-border dark:bg-chess-elevated/50";

export default function ForumPostDetailPage() {
  const params = useParams<{ postId: string }>();
  const postId = params?.postId;
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [editing, setEditing] = useState(false);
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

  const load = async () => {
    if (!postId) return;
    try {
      setLoading(true);
      const token = await getBackendJwt();
      const { data } = await api.get<PostDetail>(`/forum/posts/${postId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setPost(data);
      setEditTitle(data.title);
      setEditBody(data.body);
      setEditFen(data.fen_initial?.trim() || getFinalFenFromPgn(data.pgn_text) || DEFAULT_START_FEN);
      setError(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "게시글을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [postId]);

  const displayFen = useMemo(() => {
    if (!post || post.board_category) return null;
    return getFinalFenFromPgn(post.pgn_text) ?? post.fen_initial ?? null;
  }, [post]);

  const getRequiredToken = async () => {
    const token = await getBackendJwt();
    if (!token) {
      router.push("/api/auth/signin?callbackUrl=%2Fpost-login");
      throw new Error("로그인이 필요합니다.");
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
        const { data } = await api.get<{ id?: string }>("/forum/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMyUserId((data?.id as string | undefined) ?? null);
      } catch {
        setMyUserId(null);
      }
    };
    void loadMe();
  }, [status]);

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
      setError(err?.response?.data?.detail ?? "좋아요 처리에 실패했습니다.");
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
      setError(err?.response?.data?.detail ?? "댓글 작성에 실패했습니다.");
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
      setError(err?.response?.data?.detail ?? "댓글 삭제에 실패했습니다.");
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
    setBusy(true);
    try {
      const token = await getRequiredToken();
      await api.patch(
        `/forum/posts/${post.id}`,
        {
          title: editTitle,
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
      setError(err?.response?.data?.detail ?? "게시글 수정에 실패했습니다.");
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
      router.push(post.board_category ? "/board" : "/forum");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "게시글 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <Link
          href={post?.board_category ? "/board" : "/forum"}
          className="text-sm text-chess-accent hover:underline"
        >
          {post?.board_category ? "← 게시판 목록" : "← 포럼 목록"}
        </Link>
      </div>
      {loading && <p className="text-chess-muted">불러오는 중...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {post && (
        <>
          {editing ? (
            <form
              onSubmit={onUpdatePost}
              className="overflow-hidden rounded-2xl border border-chess-border/70 bg-gradient-to-b from-chess-surface/90 to-chess-bg/80 shadow-md dark:border-chess-border dark:from-chess-surface/50 dark:to-chess-bg/40"
            >
              <div className="border-b border-chess-border/50 bg-chess-elevated/25 px-5 py-4 dark:bg-chess-elevated/20">
                <p className="text-xs font-medium uppercase tracking-wider text-chess-muted">제목</p>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className={`mt-2 ${inputClass} text-base font-medium`}
                />
              </div>

              <div className="space-y-4 px-5 py-5">
                <div>
                  <label htmlFor="forum-edit-body" className="text-xs font-medium uppercase tracking-wider text-chess-muted">
                    본문
                  </label>
                  {!post.board_category && (
                    <div className="mt-2 flex w-full flex-col items-center">
                      <button
                        type="button"
                        onClick={() => setEditBoardSectionExpanded((v) => !v)}
                        aria-expanded={editBoardSectionExpanded}
                        className="mb-2 flex w-full max-w-[15rem] items-center justify-center gap-2 rounded-lg border border-chess-border/80 bg-chess-surface/50 py-2 text-xs font-medium text-chess-primary transition hover:bg-chess-elevated/60 dark:bg-chess-elevated/25"
                      >
                        {editBoardSectionExpanded ? (
                          <ChevronUp className="size-4 shrink-0 text-chess-muted" aria-hidden />
                        ) : (
                          <ChevronDown className="size-4 shrink-0 text-chess-muted" aria-hidden />
                        )}
                        썸네일 보드 {editBoardSectionExpanded ? "접기" : "펼치기"}
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
                              보드 제거
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
                  className="rounded-xl border border-chess-border/90 px-5 py-3 text-sm font-medium text-chess-primary transition hover:bg-chess-elevated/50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-chess-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-105 disabled:opacity-50 dark:shadow-none"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      저장 중…
                    </>
                  ) : (
                    "저장"
                  )}
                </button>
              </div>
            </form>
          ) : (
            <article className="rounded-lg border border-chess-border p-4">
              {post.board_category === "notice" && (
                <p className={noticeDetailBadgeClass}>공지</p>
              )}
              {post.board_category === "patch" && (
                <p className={patchDetailBadgeClass}>패치노트</p>
              )}
              {post.board_category === "free" && <p className={freeDetailBadgeClass}>자유글</p>}
              <h1 className="break-words text-2xl font-bold text-chess-primary [overflow-wrap:anywhere]">{post.title}</h1>
              <p className="mt-2 text-xs text-chess-muted">
                <AuthorNameLink
                  author={post.author}
                  className="font-medium text-chess-primary hover:text-chess-accent hover:underline underline-offset-2"
                />{" "}
                · {new Date(post.created_at).toLocaleString()}
              </p>
              {displayFen && (
                <div className="relative mx-auto mt-6 aspect-square w-full max-w-xs overflow-hidden rounded-xl border border-chess-border/80 bg-chess-surface shadow-sm sm:max-w-sm">
                  <ForumPostThumbnail thumbnailFen={displayFen} />
                </div>
              )}
              <p className="mt-4 whitespace-pre-wrap break-words text-sm text-chess-primary [overflow-wrap:anywhere]">
                {post.body}
              </p>
              {post.pgn_text?.trim() && !post.board_category && (
                <div className="mt-4 rounded-md border border-chess-border bg-chess-surface/40 p-3">
                  <p className="text-xs font-medium text-chess-muted">PGN</p>
                  <pre className="mt-2 max-h-48 overflow-auto break-words whitespace-pre-wrap font-mono text-xs text-chess-primary [overflow-wrap:anywhere]">
                    {post.pgn_text}
                  </pre>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || status !== "authenticated"}
                  onClick={onToggleLike}
                  aria-label={post.liked_by_me ? `좋아요 취소, ${post.like_count}개` : `좋아요, ${post.like_count}개`}
                  className="rounded-md border border-chess-border px-3 py-2 text-sm tabular-nums disabled:opacity-50"
                >
                  ❤️ {post.like_count}
                </button>
                {post.can_edit && (
                  <>
                    <button
                      type="button"
                      onClick={beginEdit}
                      className="rounded-md border border-chess-border px-3 py-2 text-sm"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={onDeletePost}
                      className="rounded-md border border-red-400 px-3 py-2 text-sm text-red-500"
                    >
                      삭제
                    </button>
                  </>
                )}
                {status === "authenticated" && myUserId && post.author.id !== myUserId && (
                  <button
                    type="button"
                    onClick={openReportPost}
                    className="rounded-md border border-chess-border px-3 py-2 text-sm text-chess-muted"
                  >
                    신고
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

          <section className="rounded-lg border border-chess-border p-4">
            <h2 className="text-lg font-semibold">댓글 {post.comment_count}</h2>
            <form onSubmit={onAddComment} className="mt-3 space-y-2">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                required
                rows={3}
                placeholder="댓글을 입력하세요"
                className="w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm break-words [overflow-wrap:anywhere]"
              />
              <button
                type="submit"
                disabled={busy || status !== "authenticated"}
                className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                댓글 작성
              </button>
            </form>
            <div className="mt-4 space-y-3">
              {post.comments.map((c) => (
                <article key={c.id} className="rounded-md border border-chess-border p-3">
                  {editingCommentId === c.id ? (
                    <form onSubmit={onSaveComment} className="space-y-2">
                      <textarea
                        value={editCommentBody}
                        onChange={(e) => setEditCommentBody(e.target.value)}
                        required
                        minLength={1}
                        maxLength={10000}
                        rows={3}
                        className="w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm break-words [overflow-wrap:anywhere]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={busy}
                          className="rounded-md bg-chess-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditComment}
                          className="rounded-md border border-chess-border px-3 py-1 text-xs"
                        >
                          취소
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm text-chess-primary [overflow-wrap:anywhere]">
                      {c.body}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-chess-muted">
                      <AuthorNameLink
                        author={c.author}
                        className="font-medium text-chess-primary hover:text-chess-accent hover:underline underline-offset-2"
                      />{" "}
                      · {new Date(c.created_at).toLocaleString()}
                    </p>
                    {editingCommentId !== c.id && status === "authenticated" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {c.can_edit && (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEditComment(c)}
                              className="text-xs text-chess-accent hover:underline"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteComment(c.id)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              삭제
                            </button>
                          </>
                        )}
                        {myUserId && c.author.id !== myUserId && (
                          <button
                            type="button"
                            onClick={() => openReportComment(c.id)}
                            className="text-xs text-chess-muted hover:underline"
                          >
                            신고
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <ReportModal
            open={reportOpen && reportTarget !== null}
            title={reportTarget === "post" ? "게시글 신고" : "댓글 신고"}
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
