"use client";

import { useState, useEffect, useRef } from "react";
import { Menu, X, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTranslation } from "../../lib/i18n";
import api from "@/shared/lib/api";
import { clearBackendJwtCache, getBackendJwt } from "@/shared/lib/backendJwt";
import AvatarThumb from "@/shared/components/ui/AvatarThumb";
import { PixelPawnGlyph } from "@/shared/components/ui/PixelGlyphs";

const NAV_ITEMS = [
  { href: "/opening-tier", labelKey: "nav.openingTier" as const },
  { href: "/dashboard", labelKey: "nav.dashboard" as const },
  { href: "/forum", labelKey: "nav.forum" as const },
  { href: "/board", labelKey: "nav.board" as const },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [forumDisplayName, setForumDisplayName] = useState<string | null>(null);
  const [forumAvatarUrl, setForumAvatarUrl] = useState<string | null | undefined>(undefined);
  const { t } = useTranslation();
  const { status: authStatus, data: session } = useSession();
  const drawerRef = useRef<HTMLDivElement>(null);

  const handleSignOut = () => {
    clearBackendJwtCache();
    void signOut({ callbackUrl: "/" });
  };

  // 경로 변경 시 드로어 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // 드로어 외부 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // 드로어 열릴 때 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const loadDisplayName = async () => {
      if (authStatus !== "authenticated") {
        setForumDisplayName(null);
        setForumAvatarUrl(undefined);
        return;
      }
      try {
        const token = await getBackendJwt();
        if (!token) {
          setForumDisplayName("로그인 연동 중");
          setForumAvatarUrl(null);
          return;
        }
        const { data } = await api.get<{
          display_name?: string;
          signup_completed?: boolean;
          avatar_url?: string | null;
        }>("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setForumAvatarUrl(data?.avatar_url ?? null);
        if (data?.signup_completed) {
          setForumDisplayName(data.display_name ?? "닉네임");
        } else {
          setForumDisplayName("가입 필요");
        }
      } catch {
        setForumDisplayName("프로필");
        setForumAvatarUrl(null);
      }
    };
    void loadDisplayName();
  }, [authStatus, session?.user?.name, pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    router.push(`/dashboard?platform=chess.com&username=${encodeURIComponent(username.trim())}`);
    setUsername("");
    setMenuOpen(false);
  };

  return (
    <>
      <header className="border-b-2 border-chess-border/60 dark:border-chess-border/80 bg-chess-bg/95 dark:bg-chess-bg sticky top-0 z-50 pt-[env(safe-area-inset-top,0px)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
        {/* 모바일/태블릿은 동일한 틀, 데스크톱(lg 이상)에서만 좌측 정렬이 되도록 wrapper를 분리 */}
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* 좌측 영역: 로고 + (lg 이상에서만) 네비 링크 */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* 로고 */}
            <Link
              href="/"
              className="font-pixel flex items-center gap-1.5 shrink-0 select-none px-1 py-0.5 hover:brightness-[1.03]"
            >
              <span className="inline-flex" aria-hidden>
                <PixelPawnGlyph className="text-chess-primary" size={18} />
              </span>
              <span className="text-sm font-bold tracking-wide leading-none whitespace-nowrap">
                <span className="text-chess-primary">foresight</span>
                <span className="text-chess-accent">-chess</span>
              </span>
            </Link>

            {/* ── 데스크톱 전용 (lg 이상) ── */}
            <nav className="hidden lg:flex items-center gap-1 text-sm shrink-0">
              {NAV_ITEMS.map(({ href, labelKey }) => {
                const active =
                  href === "/forum"
                    ? pathname.startsWith("/forum")
                    : href === "/board"
                      ? pathname.startsWith("/board")
                      : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`font-pixel px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors pixel-btn ${
                      active
                        ? "bg-chess-accent text-white dark:bg-chess-accent/22 dark:text-chess-accent"
                        : "text-chess-muted hover:text-chess-primary bg-transparent"
                    }`}
                  >
                    {t(labelKey)}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* ── 데스크톱 검색 + 설정 (lg 이상) ── */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            {authStatus === "authenticated" ? (
              <div className="flex items-center gap-1">
                <Link
                  href="/mypage"
                  className="group/nav-avatar inline-flex items-center gap-2.5 border-2 border-transparent px-1.5 py-1 rounded-[var(--pixel-radius)] text-sm font-semibold text-chess-primary hover:border-chess-border/55 hover:bg-chess-surface/70 dark:hover:bg-chess-elevated/35"
                >
                  {forumAvatarUrl !== undefined && (
                    <AvatarThumb
                      src={forumAvatarUrl}
                      alt=""
                      size={26}
                      variant="hud"
                      className="transition-[filter] group-hover/nav-avatar:brightness-105"
                    />
                  )}
                  <span className="truncate max-w-[10rem] leading-none pt-px">{forumDisplayName ?? "My"}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-sm font-medium text-chess-muted hover:text-chess-primary px-2 py-1 rounded-[var(--pixel-radius)]"
                >
                  {t("nav.signOut")}
                </button>
              </div>
            ) : (
              <a
                href="/api/auth/signin?callbackUrl=%2Fpost-login"
                className="text-sm font-medium text-chess-accent hover:underline px-2 py-1"
              >
                {t("nav.signIn")}
              </a>
            )}

            <form onSubmit={handleSearch} className="flex items-center gap-1.5">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("nav.searchPlaceholder")}
                className="pixel-input w-40 px-3 py-1.5 text-sm text-chess-primary placeholder-chess-muted"
              />
              <button
                type="submit"
                className="font-pixel pixel-btn bg-chess-accent hover:bg-chess-accent/85 text-white font-semibold px-3 py-1.5 text-sm"
              >
                {t("nav.analyze")}
              </button>
            </form>
          </div>

          {/* ── 모바일 우측 아이콘 (lg 미만) ── */}
          <div className="flex lg:hidden items-center gap-1 shrink-0">
            <button
              type="button"
              className="p-2.5 rounded-[var(--pixel-radius)] border-2 border-transparent hover:border-chess-border/50 hover:bg-chess-border/30 transition-colors"
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* ── 모바일 드로어 (lg 미만) ── */}
        {menuOpen && (
          <div
            ref={drawerRef}
            className="lg:hidden border-t-2 border-chess-border/50 bg-chess-bg px-4 py-4 space-y-4 animate-fade-in"
          >
            {/* 검색 */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-chess-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("nav.searchPlaceholder")}
                  className="pixel-input w-full pl-9 pr-3 py-2.5 text-sm text-chess-primary placeholder-chess-muted"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="font-pixel pixel-btn bg-chess-accent hover:bg-chess-accent/85 text-white font-semibold px-4 py-2.5 text-sm shrink-0"
              >
                {t("nav.analyze")}
              </button>
            </form>

            <div className="flex gap-2 border-b border-chess-border/30 pb-3">
              {authStatus === "authenticated" ? (
                <div className="flex flex-1 items-center gap-2">
                  <Link
                    href="/mypage"
                    className="group/nav-avatar flex flex-1 items-center justify-center gap-2.5 py-2.5 pixel-btn bg-chess-surface text-sm font-semibold text-chess-primary"
                    onClick={() => setMenuOpen(false)}
                  >
                    {forumAvatarUrl !== undefined && (
                      <AvatarThumb
                        src={forumAvatarUrl}
                        alt=""
                        size={28}
                        variant="hud"
                        className="transition-[filter] group-hover/nav-avatar:brightness-105"
                      />
                    )}
                    <span className="truncate leading-snug">{forumDisplayName ?? "My"}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      handleSignOut();
                      setMenuOpen(false);
                    }}
                    className="flex-1 py-2 pixel-btn text-sm font-medium text-chess-primary"
                  >
                    {t("nav.signOut")}
                  </button>
                </div>
              ) : (
                <a
                  href="/api/auth/signin?callbackUrl=%2Fpost-login"
                  className="flex-1 text-center py-2 pixel-btn bg-chess-accent text-white text-sm font-semibold border-chess-accent"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("nav.signIn")}
                </a>
              )}
            </div>

            {/* 네비 링크 */}
            <nav className="space-y-1">
              {NAV_ITEMS.map(({ href, labelKey }) => {
                const active =
                  href === "/forum"
                    ? pathname.startsWith("/forum")
                    : href === "/board"
                      ? pathname.startsWith("/board")
                      : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`font-pixel flex items-center px-4 py-3 text-sm font-medium pixel-btn ${
                      active
                        ? "bg-chess-accent/18 text-chess-accent border-chess-accent/45"
                        : "text-chess-muted hover:text-chess-primary bg-transparent"
                    }`}
                  >
                    {t(labelKey)}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
