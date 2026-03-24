import Link from "next/link";

export type ForumAuthor = {
  id: string;
  public_id?: string;
  display_name: string;
  role?: string;
};

type AuthorNameLinkProps = {
  author: ForumAuthor;
  href?: string;
  className?: string;
};

export function AuthorNameLink({ author, href, className }: AuthorNameLinkProps) {
  const to = href ?? `/user/${author.public_id ?? author.id}`;
  const isAdmin = (author.role ?? "").toLowerCase().trim() === "admin";
  return (
    <Link href={to} className={className}>
      <span className="inline-flex items-center gap-0.5">
        {author.display_name}
        {isAdmin ? (
          <span title="관리자" aria-label="관리자" className="select-none">
            👑
          </span>
        ) : null}
      </span>
    </Link>
  );
}

type AuthorNameInlineProps = {
  author: ForumAuthor;
  className?: string;
};

/** Same display as link variant but without navigation (e.g. inside another link). */
export function AuthorNameInline({ author, className }: AuthorNameInlineProps) {
  const isAdmin = (author.role ?? "").toLowerCase().trim() === "admin";
  return (
    <span className={className}>
      <span className="inline-flex items-center gap-0.5">
        {author.display_name}
        {isAdmin ? (
          <span title="관리자" aria-label="관리자" className="select-none">
            👑
          </span>
        ) : null}
      </span>
    </span>
  );
}
