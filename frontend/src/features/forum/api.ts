/**
 * Forum feature — API call helpers
 */
import api from "@/shared/lib/api";
import type { PostItem, PostListResponse, PostDetail, CommentItem } from "./types";

export type FetchPostsParams = {
  sort?: string;
  limit?: number;
  cursor?: string | null;
  page?: number | null;
  q?: string;
};

export const fetchForumPosts = async (params: FetchPostsParams): Promise<PostListResponse> => {
  const queryParams: Record<string, string | number> = {
    sort: params.sort ?? "new",
    limit: params.limit ?? 8,
  };
  if (params.q) queryParams.q = params.q;
  if (params.cursor) queryParams.cursor = params.cursor;
  if (params.page) queryParams.page = params.page;
  const { data } = await api.get<PostListResponse>("/forum/posts", { params: queryParams });
  return data;
};

export const fetchForumPost = async (
  postId: string,
  token?: string | null,
): Promise<PostDetail> => {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const { data } = await api.get<PostDetail>(`/forum/posts/${postId}`, { headers });
  return data;
};

export const fetchPostComments = async (
  postId: string,
  token?: string | null,
): Promise<CommentItem[]> => {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const { data } = await api.get<CommentItem[]>(`/forum/posts/${postId}/comments`, { headers });
  return data ?? [];
};

export const fetchMyWritePermission = async (token: string): Promise<boolean> => {
  const { data } = await api.get("/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Boolean(data?.signup_completed);
};
