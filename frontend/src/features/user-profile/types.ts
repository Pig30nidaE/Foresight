export type MeProfile = {
  id: string;
  public_id: string;
  email: string | null;
  display_name: string;
  signup_completed: boolean;
  profile_public: boolean;
  analysis_tickets?: number;
  avatar_url?: string | null;
  display_name_changed_at?: string | null;
  display_name_change_available_at?: string | null;
};

export type ProfilePostItem = {
  id: string;
  public_id: string;
  title: string;
  body_preview?: string;
  created_at: string;
  board_category?: string | null;
};

export type ProfileCommentItem = {
  id: string;
  body: string;
  created_at: string;
  post_id: string;
  post_public_id: string;
  post_title: string;
  post_board_category?: string | null;
};

export type SavedAnalyzedGameItem = {
  id: string;
  game_id: string;
  label: string;
  depth: number;
  dashboard_href?: string | null;
  analyzed_at: string;
};

export type UserPublicProfile = {
  id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  profile_public: boolean;
  activity_visible: boolean;
  posts: ProfilePostItem[];
  comments: ProfileCommentItem[];
  posts_total: number;
  comments_total: number;
};
