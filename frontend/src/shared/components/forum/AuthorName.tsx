import Link from "next/link";

import AvatarThumb from "@/shared/components/ui/AvatarThumb";
import { PixelCrownGlyph } from "@/shared/components/ui/PixelGlyphs";
import { userProfileHref } from "@/shared/lib/userProfileHref";

export type ForumAuthor = {
  id: string;
  public_id?: string;
  display_name: string;
  role?: string;
  avatar_url?: string | null;
};

type AuthorNameLinkProps = {
  author: ForumAuthor;
  href?: string;
  className?: string;
  /** 기본 24 — 본문 상단 등 큰 타이포에는 28~32 권장 */
  avatarSize?: number;
};

export function isForumAdminAuthor(role?: string): boolean {
  return (role ?? "").toLowerCase().trim() === "admin";
}

export function isAnonymousAuthor(author: ForumAuthor): boolean {
  return (author.role ?? "").toLowerCase().trim() === "guest" || !author.id;
}

export function AuthorNameLink({ author, href, className, avatarSize = 24 }: AuthorNameLinkProps) {
  if (isAnonymousAuthor(author)) {
    return <AuthorNameInline author={author} className={className} avatarSize={avatarSize} />;
  }
  const to = href ?? userProfileHref(author);
  const isAdmin = isForumAdminAuthor(author.role);
  return (
    <Link
      href={to}
      className={`group/author inline-flex min-w-0 max-w-full items-center gap-2.5 ${className ?? ""}`}
    >
      <span className="relative shrink-0" aria-hidden>
        <AvatarThumb
          src={author.avatar_url}
          alt=""
          size={avatarSize}
          variant="hud"
          className="transition-[filter] group-hover/author:brightness-105"
        />
      </span>
      <span className="inline-flex min-w-0 items-center gap-0.5 leading-snug">
        <span className="truncate">{author.display_name}</span>
        {isAdmin ? (
          <span title="관리자" aria-label="관리자" className="shrink-0 inline-flex select-none text-chess-accent">
            <PixelCrownGlyph size={14} />
          </span>
        ) : null}
      </span>
    </Link>
  );
}

type AuthorNameInlineProps = {
  author: ForumAuthor;
  className?: string;
  avatarSize?: number;
};

/** Same display as link variant but without navigation (e.g. inside another link). */
export function AuthorNameInline({ author, className, avatarSize = 24 }: AuthorNameInlineProps) {
  const isAdmin = (author.role ?? "").toLowerCase().trim() === "admin";
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-2.5 ${className ?? ""}`}>
      <span className="shrink-0" aria-hidden>
        <AvatarThumb src={author.avatar_url} alt="" size={avatarSize} variant="hud" />
      </span>
      <span className="inline-flex min-w-0 items-center gap-0.5 leading-snug">
        <span className="truncate">{author.display_name}</span>
        {isAdmin ? (
          <span title="관리자" aria-label="관리자" className="shrink-0 inline-flex select-none text-chess-accent">
            <PixelCrownGlyph size={14} />
          </span>
        ) : null}
      </span>
    </span>
  );
}
