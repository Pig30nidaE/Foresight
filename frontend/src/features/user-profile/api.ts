import api from "@/shared/lib/api";
import type {
  MeProfile,
  ProfileCommentItem,
  ProfilePostItem,
  UserPublicProfile,
} from "@/features/user-profile/types";

const authHeaders = (token?: string) =>
  token ? { Authorization: `Bearer ${token}` } : undefined;

export type PaginatedProfileList<T> = {
  items: T[];
  total: number;
};

export type PublicProfileQuery = {
  posts_page: number;
  posts_page_size: number;
  comments_page: number;
  comments_page_size: number;
};

export const getMeProfile = async (token: string): Promise<MeProfile> => {
  const { data } = await api.get<MeProfile>("/me", {
    headers: authHeaders(token),
  });
  return data;
};

export const getMyPosts = async (
  token: string,
  page: number,
  pageSize: number,
): Promise<PaginatedProfileList<ProfilePostItem>> => {
  const { data } = await api.get<PaginatedProfileList<ProfilePostItem>>("/me/posts", {
    params: { page, page_size: pageSize },
    headers: authHeaders(token),
  });
  return data;
};

export const getMyComments = async (
  token: string,
  page: number,
  pageSize: number,
): Promise<PaginatedProfileList<ProfileCommentItem>> => {
  const { data } = await api.get<PaginatedProfileList<ProfileCommentItem>>("/me/comments", {
    params: { page, page_size: pageSize },
    headers: authHeaders(token),
  });
  return data;
};

export const updateMyProfile = async (
  token: string,
  body: Record<string, unknown>,
): Promise<MeProfile> => {
  const { data } = await api.patch<MeProfile>("/me/profile", body, {
    headers: authHeaders(token),
  });
  return data;
};

export const uploadProfileImage = async (token: string, file: File): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<{ url: string }>("/upload", formData, {
    headers: authHeaders(token),
  });
  return data;
};

export const getPublicUserProfile = async (
  userId: string,
  params: PublicProfileQuery,
  token?: string,
): Promise<UserPublicProfile> => {
  const { data } = await api.get<UserPublicProfile>(`/users/${userId}`, {
    params,
    headers: authHeaders(token),
  });
  return data;
};
