"use client";

import { useState, useEffect, useRef } from "react";
import { Menu, X, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTranslation } from "../../lib/i18n";
import api from "@/shared/lib/api";
import { clearBackendJwtCache, getBackendJwt } from "@/shared/lib/backendJwt";

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
        return;
      }
      try {
        const token = await getBackendJwt();
        if (!token) {
          setForumDisplayName("로그인 연동 중");
          return;
        }
        const { data } = await api.get<{
          display_name?: string;
          signup_completed?: boolean;
        }>("/forum/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data?.signup_completed) {
          setForumDisplayName(data.display_name ?? "닉네임");
        } else {
          setForumDisplayName("가입 필요");
        }
      } catch {
        setForumDisplayName("프로필");
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
      <header className="border-b border-chess-border/60 dark:border-chess-border/80 bg-chess-bg/80 dark:bg-chess-bg/90 backdrop-blur-md sticky top-0 z-50 pt-[env(safe-area-inset-top,0px)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
        {/* 모바일/태블릿은 동일한 틀, 데스크톱(md 이상)에서만 좌측 정렬이 되도록 wrapper를 분리 */}
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* 좌측 영역: 로고 + (md 이상에서만) 네비 링크 */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* 로고 */}
            <Link
              href="/"
              className="flex items-center gap-1.5 font-bold text-lg tracking-tight select-none shrink-0"
            >
              <span className="text-xl leading-none">♟️</span>
              <span className="text-chess-primary">Fore</span>
              <span className="text-chess-accent">sight</span>
            </Link>

            {/* ── 데스크톱 전용 (md 이상) ── */}
            <nav className="hidden md:flex items-center gap-1 text-sm shrink-0">
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
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "bg-chess-accent text-white dark:bg-chess-accent/18 dark:text-chess-accent dark:ring-1 dark:ring-chess-accent/35"
                        : "text-chess-muted hover:text-chess-primary hover:bg-chess-border/50 dark:hover:bg-chess-elevated/50"
                    }`}
                  >
                    {t(labelKey)}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* ── 데스크톱 검색 + 설정 (md 이상) ── */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {authStatus === "authenticated" ? (
              <div className="flex items-center gap-1">
                <Link
                  href="/mypage"
                  className="text-sm font-semibold text-chess-primary hover:text-chess-accent px-2 py-1 rounded-md"
                >
                  {forumDisplayName ?? "My"}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-sm font-medium text-chess-muted hover:text-chess-primary px-2 py-1 rounded-md"
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
                className="w-40 bg-chess-surface border border-chess-border rounded-md px-3 py-1.5 text-sm text-chess-primary placeholder-chess-muted focus:outline-none focus:border-chess-accent transition-colors"
              />
              <button
                type="submit"
                className="bg-chess-accent hover:bg-chess-accent/80 text-white font-semibold px-3 py-1.5 rounded-md text-sm transition-colors"
              >
                {t("nav.analyze")}
              </button>
            </form>
          </div>

          {/* ── 모바일 우측 아이콘 (md 미만) ── */}
          <div className="flex md:hidden items-center gap-1 shrink-0">
            <button
              type="button"
              className="p-2.5 rounded-full hover:bg-chess-border/40 transition-colors"
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* ── 모바일 드로어 ── */}
        {menuOpen && (
          <div
            ref={drawerRef}
            className="md:hidden border-t border-chess-border/40 bg-chess-bg/95 backdrop-blur-md px-4 py-4 space-y-4 animate-fade-in"
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
                  className="w-full bg-chess-surface border border-chess-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-chess-primary placeholder-chess-muted focus:outline-none focus:border-chess-accent transition-colors"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="bg-chess-accent hover:bg-chess-accent/80 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors shrink-0"
              >
                {t("nav.analyze")}
              </button>
            </form>

            <div className="flex gap-2 border-b border-chess-border/30 pb-3">
              {authStatus === "authenticated" ? (
                <div className="flex flex-1 items-center gap-2">
                  <Link
                    href="/mypage"
                    className="flex-1 text-center py-2 rounded-lg bg-chess-surface border border-chess-border text-sm font-semibold text-chess-primary"
                    onClick={() => setMenuOpen(false)}
                  >
                    {forumDisplayName ?? "My"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      handleSignOut();
                      setMenuOpen(false);
                    }}
                    className="flex-1 py-2 rounded-lg border border-chess-border text-sm font-medium text-chess-primary"
                  >
                    {t("nav.signOut")}
                  </button>
                </div>
              ) : (
                <a
                  href="/api/auth/signin?callbackUrl=%2Fpost-login"
                  className="flex-1 text-center py-2 rounded-lg bg-chess-accent text-white text-sm font-semibold"
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
                    className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-colors ${
                      active
                        ? "bg-chess-accent/15 text-chess-accent border border-chess-accent/30"
                        : "text-chess-muted hover:text-chess-primary hover:bg-chess-border/40"
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
