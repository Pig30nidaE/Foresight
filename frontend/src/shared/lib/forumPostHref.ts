/** 게시판 글은 `/board/…`, 포럼 글은 `/forum/…` 로 분리 */
export function forumPostHref(post: {
  public_id?: string;
  id: string;
  board_category?: string | null;
}): string {
  const slug = post.public_id ?? post.id;
  if (post.board_category) return `/board/${slug}`;
  return `/forum/${slug}`;
}
