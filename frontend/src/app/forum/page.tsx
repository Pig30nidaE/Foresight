"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import ForumBoardEditOverlay from "@/app/forum/ForumBoardEditOverlay";
import ForumBoardPeekCard from "@/app/forum/ForumBoardPeekCard";
import ForumPostThumbnail from "@/app/forum/ForumPostThumbnail";
import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { composerPreviewFen, DEFAULT_START_FEN } from "@/shared/lib/forumChess";
import { AuthorNameLink } from "@/shared/components/forum/AuthorName";
import { PixelChatGlyph, PixelHeartGlyph } from "@/shared/components/ui/PixelGlyphs";

type PostItem = {
  id: string;
  public_id: string;
  title: string;
  body_preview: string;
  author: {
    id: string;
    public_id: string;
    display_name: string;
    role?: string;
    avatar_url?: string | null;
  };
  created_at: string;
  like_count: number;
  comment_count: number;
  thumbnail_fen?: string | null;
  has_pgn?: boolean;
  has_fen?: boolean;
};

type PostListResponse = {
  items: PostItem[];
  next_cursor: string | null;
};

function resetComposeState(setters: {
  setCreateTitle: (v: string) => void;
  setCreateBody: (v: string) => void;
  setCreateBoardFen: (v: string) => void;
  setCreateFenTouched: (v: boolean) => void;
  setChessImported: (v: boolean) => void;
  setBoardOverlayOpen: (v: boolean) => void;
  setComposeBoardSectionExpanded: (v: boolean) => void;
}) {
  setters.setCreateTitle("");
  setters.setCreateBody("");
  setters.setCreateBoardFen(DEFAULT_START_FEN);
  setters.setCreateFenTouched(false);
  setters.setChessImported(false);
  setters.setBoardOverlayOpen(false);
  setters.setComposeBoardSectionExpanded(true);
}

export default function ForumPage() {
  const router = useRouter();
  const { status } = useSession();
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMe, setLoadingMe] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [createBoardFen, setCreateBoardFen] = useState(DEFAULT_START_FEN);
  const [createFenTouched, setCreateFenTouched] = useState(false);
  const [chessImported, setChessImported] = useState(false);
  const [boardOverlayOpen, setBoardOverlayOpen] = useState(false);
  const [composeBoardSectionExpanded, setComposeBoardSectionExpanded] = useState(true);
  const [busyCreate, setBusyCreate] = useState(false);
  const [sort, setSort] = useState("new");

  const load = async () => {
    setLoadingPosts(true);
    setPostsError(null);
    try {
      const { data } = await api.get<PostListResponse>("/forum/posts", {
        params: { sort, limit: 40 },
      });
      setPosts(data.items ?? []);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setPostsError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "게시글 목록을 불러오지 못했습니다."
      );
    } finally {
      setLoadingPosts(false);
    }

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
        setMeError("백엔드 연동 토큰을 가져오지 못했습니다. 다시 로그인해 주세요.");
        return;
      }
      const meRes = await api.get("/forum/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCanWrite(Boolean(meRes.data?.signup_completed));
    } catch (e: unknown) {
      setCanWrite(false);
      const err = e as { response?: { data?: { detail?: string } } };
      setMeError(
        typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "계정 정보를 불러오지 못했습니다."
      );
    } finally {
      setLoadingMe(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        await load();
      } catch {
        // handled in load
      }
    };
    void run();
  }, [router, status, sort]);

  const importBoard = () => {
    setChessImported(true);
    setBoardOverlayOpen(true);
  };

  const removeBoard = () => {
    setChessImported(false);
    setBoardOverlayOpen(false);
    setCreateBoardFen(DEFAULT_START_FEN);
    setCreateFenTouched(false);
  };

  const closeBoardOverlay = () => {
    setBoardOverlayOpen(false);
  };

  const onOverlayBoardFen = (f: string) => {
    setCreateBoardFen(f);
    setCreateFenTouched(true);
  };

  const onCreatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!canWrite || busyCreate) return;
    if (!createTitle.trim() || !createBody.trim()) {
      setPostsError("제목과 본문을 모두 입력해 주세요.");
      return;
    }
    setBusyCreate(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error("로그인 토큰이 없습니다.");
      const fenOut = chessImported && createFenTouched ? createBoardFen : null;
      const { data } = await api.post(
        "/forum/posts",
        {
          title: createTitle,
          body: createBody,
          pgn_text: null,
          fen_initial: fenOut,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      resetComposeState({
        setCreateTitle,
        setCreateBody,
        setCreateBoardFen,
        setCreateFenTouched,
        setChessImported,
        setBoardOverlayOpen,
        setComposeBoardSectionExpanded,
      });
      setCreating(false);
      await load();
      const slug = (data as { public_id?: string; id?: string })?.public_id ?? data?.id;
      if (slug) {
        router.push(`/forum/${slug}`);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      const msg = typeof d === "string" ? d : err?.message ?? "게시글 작성에 실패했습니다.";
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
      setCreateFenTouched,
      setChessImported,
      setBoardOverlayOpen,
      setComposeBoardSectionExpanded,
    });
  };

  const inputClass =
    "w-full pixel-input px-4 py-3 text-sm text-chess-primary placeholder:text-chess-muted/70 dark:bg-chess-elevated/50";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-chess-primary">
            {creating && canWrite ? "새 글 작성" : "포럼"}
          </h2>
          <p className="mt-1 text-sm text-chess-muted">
            {creating && canWrite ? "제목과 본문을 채운 뒤 필요할 때만 보드를 연결하세요." : "격자 카드로 글을 살펴보세요."}
          </p>
          {!creating && (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-chess-muted">
              <span>정렬</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="pixel-input px-3 py-2 text-sm text-chess-primary"
              >
                <option value="new">최신순</option>
                <option value="old">오래된순</option>
                <option value="likes">좋아요순</option>
                <option value="comments">댓글순</option>
              </select>
            </label>
          )}
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => {
              if (creating) closeCompose();
              else setCreating(true);
            }}
            className="font-pixel pixel-btn inline-flex items-center gap-2 bg-chess-accent px-4 py-2.5 text-sm font-semibold text-white border-chess-accent hover:brightness-105"
          >
            {creating ? (
              "닫기"
            ) : (
              <>
                <PenLine className="size-4 opacity-90" aria-hidden />
                글쓰기
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (status !== "authenticated") {
                router.push("/api/auth/signin?callbackUrl=%2Fpost-login");
              } else {
                router.push("/signup/consent");
              }
            }}
            className="font-pixel pixel-btn bg-chess-surface/70 px-4 py-2.5 text-sm font-medium text-chess-primary hover:bg-chess-elevated/80"
          >
            {status === "authenticated" ? "가입 완료 후 글쓰기" : "로그인 후 글쓰기"}
          </button>
        )}
      </div>
      {meError && (
        <p className="pixel-frame border-amber-600/45 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {meError}
        </p>
      )}
      {loadingMe && status === "authenticated" && (
        <p className="text-sm text-chess-muted">계정 권한 확인 중...</p>
      )}
      {loadingPosts && <p className="text-sm text-chess-muted">목록을 불러오는 중...</p>}
      {postsError && <p className="text-sm text-red-600 dark:text-red-400">{postsError}</p>}

      {creating && canWrite && (
        <form
          onSubmit={onCreatePost}
          className="overflow-hidden pixel-frame bg-chess-surface/80 dark:bg-chess-surface/35"
        >
          <div className="border-b border-chess-border/50 bg-chess-elevated/25 px-5 py-4 dark:bg-chess-elevated/20">
            <p className="text-xs font-medium uppercase tracking-wider text-chess-muted">제목</p>
            <input
              type="text"
              required
              minLength={1}
              maxLength={500}
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="이 글의 제목을 입력하세요"
              className={`mt-2 ${inputClass} text-base font-medium`}
            />
          </div>

          <div className="space-y-4 px-5 py-5">
            <div>
              <label htmlFor="forum-compose-body" className="text-xs font-medium uppercase tracking-wider text-chess-muted">
                본문
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
                  썸네일 보드 {composeBoardSectionExpanded ? "접기" : "펼치기"}
                </button>
                {composeBoardSectionExpanded && (
                  <div className="flex w-full flex-col items-center">
                    <ForumBoardPeekCard
                      imported={chessImported}
                      previewFen={composerPreviewFen(createBoardFen)}
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
              <textarea
                id="forum-compose-body"
                minLength={1}
                maxLength={50000}
                rows={14}
                value={createBody}
                onChange={(e) => setCreateBody(e.target.value)}
                placeholder="내용을 작성하세요. 보드와 동시에 편집할 수 있습니다."
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
              취소
            </button>
            <button
              type="submit"
              disabled={busyCreate}
              className="font-pixel pixel-btn inline-flex items-center justify-center gap-2 bg-chess-accent px-6 py-3 text-sm font-semibold text-white border-chess-accent enabled:hover:brightness-105 disabled:opacity-50"
            >
              {busyCreate ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  작성 중…
                </>
              ) : (
                "작성 완료"
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
          onBoardFenChange={onOverlayBoardFen}
          onDeleteBoard={removeBoard}
          busy={busyCreate}
          inputClassName={inputClass}
        />
      )}

      <div className="pixel-frame bg-chess-surface/30 p-3 sm:p-4 dark:bg-chess-surface/22">
        {!loadingPosts && !postsError && posts.length === 0 && (
          <div className="mb-4 pixel-frame border-dashed border-chess-border/80 bg-chess-bg/55 px-3 py-8 text-center dark:bg-chess-elevated/20">
            <p className="text-sm font-medium text-chess-primary">아직 게시글이 없습니다</p>
            <p className="mt-1 text-sm text-chess-muted">
              {canWrite && !creating ? "위에서 글쓰기를 눌러 첫 글을 남겨 보세요." : "첫 글이 곧 올라올 거예요."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {posts.map((p) => (
            <article
              key={p.id}
              className="group flex min-h-0 flex-col overflow-hidden pixel-frame bg-chess-bg/85 transition-colors hover:border-chess-accent/50 dark:bg-chess-surface/40"
            >
              <Link
                href={`/forum/${p.public_id ?? p.id}`}
                className="relative block aspect-square w-full shrink-0 overflow-hidden bg-chess-surface"
              >
                <ForumPostThumbnail thumbnailFen={p.thumbnail_fen} />
              </Link>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2.5 sm:p-3">
                <h3 className="text-sm font-semibold leading-snug tracking-tight text-chess-primary">
                  <Link
                    href={`/forum/${p.public_id ?? p.id}`}
                    className="transition group-hover:text-chess-accent"
                  >
                    {p.title}
                  </Link>
                </h3>
                <p className="mt-1.5 line-clamp-2 flex-1 overflow-hidden break-words text-xs leading-relaxed text-chess-muted [overflow-wrap:anywhere]">
                  {p.body_preview}
                </p>
                <div
                  className="mt-2.5 min-w-0 text-xs leading-tight text-chess-muted/90 sm:text-[13px]"
                  title={`${p.author.display_name} · ${new Date(p.created_at).toLocaleDateString()}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <AuthorNameLink
                      author={p.author}
                      avatarSize={22}
                      className="min-w-0 max-w-[min(100%,14rem)] font-medium text-chess-primary hover:text-chess-accent hover:underline underline-offset-2"
                    />
                    <span className="shrink-0 tabular-nums text-chess-muted/80">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`좋아요 ${p.like_count}`}>
                      <PixelHeartGlyph className="text-red-500 dark:text-red-400" size={14} />
                      {p.like_count}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`댓글 ${p.comment_count}`}>
                      <PixelChatGlyph size={14} />
                      {p.comment_count}
                    </span>
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
