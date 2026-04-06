import api from "@/shared/lib/api";

const authHeaders = (token?: string) =>
  token ? { Authorization: `Bearer ${token}` } : undefined;

export type BoardKind = "notice" | "patch" | "free";

export type CommunityAuthor = {
  id: string;
  public_id: string;
  display_name: string;
  role?: string;
  avatar_url?: string | null;
};

export type ForumPostItem = {
  id: string;
  public_id: string;
  title: string;
  body_preview: string;
  author: CommunityAuthor;
  created_at: string;
  like_count: number;
  comment_count: number;
  thumbnail_fen?: string | null;
  has_pgn?: boolean;
  has_fen?: boolean;
  pgn_text?: string | null;
  board_category?: string | null;
};

export type ForumPostListResponse = {
  items: ForumPostItem[];
  next_cursor: string | null;
  next_page?: number | null;
};

export type BoardPostItem = {
  id: string;
  public_id: string;
  title: string;
  board_category?: string | null;
  author: CommunityAuthor;
  created_at: string;
  like_count: number;
  comment_count: number;
  thumbnail_fen?: string | null;
};

export type BoardPostListResponse = {
  items: BoardPostItem[];
  next_cursor?: string | null;
  next_page?: number | null;
};

export type MeSummary = {
  id?: string;
  signup_completed?: boolean;
  role?: string;
};

export type ForumCommentItem = {
  id: string;
  body: string;
  created_at: string;
  parent_comment_id?: string | null;
  can_edit?: boolean;
  author: CommunityAuthor;
};

export type ForumPostDetail = {
  id: string;
  public_id: string;
  title: string;
  body: string;
  pgn_text: string | null;
  fen_initial: string | null;
  board_annotations?: unknown;
  board_category?: string | null;
  author: CommunityAuthor;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  can_edit: boolean;
  comments: ForumCommentItem[];
};

export type CreateForumPostPayload = {
  title: string;
  body: string;
  pgn_text: string | null;
  fen_initial: string | null;
  board_annotations: unknown | null;
};

export type CreateBoardPostPayload = {
  title: string;
  body: string;
  kind: BoardKind;
};

export type UpdateForumPostPayload = {
  title: string;
  body: string;
  pgn_text: string | null;
  fen_initial: string | null;
  board_annotations?: unknown | null;
};

export type CreateForumCommentPayload = {
  body: string;
  parent_comment_id?: string;
};

export type CreateForumReportPayload = {
  post_id?: string;
  comment_id?: string;
  reason: string;
};

export const getForumPosts = async (params: Record<string, string | number>): Promise<ForumPostListResponse> => {
  const { data } = await api.get<ForumPostListResponse>("/forum/posts", { params });
  return data;
};

export const getBoardPosts = async (params: Record<string, string | number>): Promise<BoardPostListResponse> => {
  const { data } = await api.get<BoardPostListResponse>("/forum/board/posts", { params });
  return data;
};

export const getMeSummary = async (token: string): Promise<MeSummary> => {
  const { data } = await api.get<MeSummary>("/me", {
    headers: authHeaders(token),
  });
  return data;
};

export const createForumPost = async (
  token: string,
  payload: CreateForumPostPayload,
): Promise<{ id: string; public_id?: string }> => {
  const { data } = await api.post<{ id: string; public_id?: string }>("/forum/posts", payload, {
    headers: authHeaders(token),
  });
  return data;
};

export const createBoardPost = async (
  token: string,
  payload: CreateBoardPostPayload,
): Promise<{ id: string; public_id?: string }> => {
  const { data } = await api.post<{ id: string; public_id?: string }>("/forum/board/posts", payload, {
    headers: authHeaders(token),
  });
  return data;
};

export const getForumPostDetail = async (postId: string, token?: string): Promise<ForumPostDetail> => {
  const { data } = await api.get<ForumPostDetail>(`/forum/posts/${postId}`, {
    headers: authHeaders(token),
  });
  return data;
};

export const likeForumPost = async (postId: string, token: string): Promise<void> => {
  await api.post(
    `/forum/posts/${postId}/like`,
    {},
    {
      headers: authHeaders(token),
    },
  );
};

export const unlikeForumPost = async (postId: string, token: string): Promise<void> => {
  await api.delete(`/forum/posts/${postId}/like`, {
    headers: authHeaders(token),
  });
};

export const createForumComment = async (
  postId: string,
  token: string,
  payload: CreateForumCommentPayload,
): Promise<void> => {
  await api.post(`/forum/posts/${postId}/comments`, payload, {
    headers: authHeaders(token),
  });
};

export const updateForumComment = async (commentId: string, token: string, body: string): Promise<void> => {
  await api.patch(
    `/forum/comments/${commentId}`,
    { body },
    {
      headers: authHeaders(token),
    },
  );
};

export const deleteForumComment = async (commentId: string, token: string): Promise<void> => {
  await api.delete(`/forum/comments/${commentId}`, {
    headers: authHeaders(token),
  });
};

export const createForumReport = async (token: string, payload: CreateForumReportPayload): Promise<void> => {
  await api.post("/forum/reports", payload, {
    headers: authHeaders(token),
  });
};

export const updateForumPost = async (
  postId: string,
  token: string,
  payload: UpdateForumPostPayload,
): Promise<void> => {
  await api.patch(`/forum/posts/${postId}`, payload, {
    headers: authHeaders(token),
  });
};

export const deleteForumPost = async (postId: string, token: string): Promise<void> => {
  await api.delete(`/forum/posts/${postId}`, {
    headers: authHeaders(token),
  });
};
