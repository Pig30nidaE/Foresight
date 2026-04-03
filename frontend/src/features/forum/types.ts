/**
 * Forum feature — shared type definitions
 */

export type ForumAuthor = {
  id: string;
  public_id: string;
  display_name: string;
  role?: string;
  avatar_url?: string | null;
};

export type PostItem = {
  id: string;
  public_id: string;
  title: string;
  body_preview: string;
  author: ForumAuthor;
  created_at: string;
  like_count: number;
  comment_count: number;
  thumbnail_fen?: string | null;
  has_pgn?: boolean;
  has_fen?: boolean;
  /** 목록에서 수순 재생 (API `PostListItem.pgn_text`) */
  pgn_text?: string | null;
  board_category?: string | null;
};

export type PostListResponse = {
  items: PostItem[];
  next_cursor: string | null;
  next_page?: number | null;
};

export type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  parent_comment_id?: string | null;
  can_edit?: boolean;
  author: ForumAuthor;
};

export type PostDetail = {
  id: string;
  public_id: string;
  title: string;
  body: string;
  pgn_text: string | null;
  fen_initial: string | null;
  board_annotations?: unknown;
  board_category?: string | null;
  author: ForumAuthor;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  can_edit: boolean;
  comments: CommentItem[];
  thumbnail_fen?: string | null;
};
