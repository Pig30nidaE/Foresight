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

  const closeMenuAndNavigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <>
      <header className="border-b-2 border-chess-border/60 dark:border-chess-border/80 bg-chess-bg/95 dark:bg-chess-bg sticky top-0 z-50 pt-[env(safe-area-inset-top,0px)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
        {/* 모바일/태블릿은 동일한 틀, 데스크톱(lg 이상)에서만 좌측 정렬이 되도록 wrapper를 분리 */}
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* 좌측 영역: 로고 + (xl 이상에서만) 네비 — 태블릿·iPad 는 모바일 드로어 */}
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

            {/* ── 데스크톱 전용 (xl 이상, 1280px+) ── */}
            <nav className="hidden xl:flex items-center gap-1 text-sm shrink-0">
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

          {/* ── 데스크톱 검색 + 설정 (xl 이상) ── */}
          <div className="hidden xl:flex items-center gap-3 shrink-0">
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

          {/* ── 모바일·태블릿 우측 아이콘 (xl 미만) ── */}
          <div className="flex xl:hidden items-center gap-1 shrink-0">
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

        {/* ── 모바일·태블릿: 헤더 바로 아래로 펼쳐지는 패널 (전체 화면 오버레이 아님) ── */}
        <div
          ref={drawerRef}
          className={`xl:hidden overflow-hidden border-chess-border/50 transition-[max-height] duration-300 ease-out motion-reduce:transition-none ${
            menuOpen
              ? "max-h-[min(75dvh,calc(100dvh-3.5rem-env(safe-area-inset-top,0px)))] border-t-2"
              : "max-h-0 border-t-0 pointer-events-none"
          }`}
        >
          <div className="max-h-[min(75dvh,calc(100dvh-3.5rem-env(safe-area-inset-top,0px)))] overflow-y-auto overscroll-y-contain bg-chess-bg px-4 py-4 space-y-4">
            <div className="flex flex-col gap-2 border-b border-chess-border/30 pb-3 sm:flex-row">
              {authStatus === "authenticated" ? (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-stretch">
                  <button
                    type="button"
                    onClick={() => closeMenuAndNavigate("/mypage")}
                    className="group/nav-avatar flex w-full items-center gap-3 rounded-[var(--pixel-radius)] border-2 border-chess-border/40 bg-chess-surface px-3 py-3 text-left text-sm font-semibold text-chess-primary hover:border-chess-accent/50"
                  >
                    {forumAvatarUrl !== undefined && (
                      <AvatarThumb
                        src={forumAvatarUrl}
                        alt=""
                        size={36}
                        variant="hud"
                        className="shrink-0 transition-[filter] group-hover/nav-avatar:brightness-105"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate leading-snug">{forumDisplayName ?? "My"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSignOut();
                      setMenuOpen(false);
                    }}
                    className="w-full py-3 pixel-btn text-sm font-medium text-chess-primary sm:w-auto sm:min-w-[6rem]"
                  >
                    {t("nav.signOut")}
                  </button>
                </div>
              ) : (
                <a
                  href="/api/auth/signin?callbackUrl=%2Fpost-login"
                  className="w-full text-center py-3 pixel-btn bg-chess-accent text-white text-sm font-semibold border-chess-accent"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("nav.signIn")}
                </a>
              )}
            </div>

            {/* 검색 — iOS 자동 확대 방지: 입력 글자 16px 이상 */}
            <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-chess-muted pointer-events-none"
                />
                <input
                  type="search"
                  enterKeyHint="search"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("nav.searchPlaceholder")}
                  className="pixel-input min-h-[44px] w-full pl-9 pr-3 py-2.5 text-base text-chess-primary placeholder:text-chess-muted sm:text-sm"
                />
              </div>
              <button
                type="submit"
                className="font-pixel pixel-btn min-h-[44px] w-full shrink-0 bg-chess-accent px-4 py-2.5 text-base font-semibold text-white hover:bg-chess-accent/85 sm:w-auto sm:min-h-0 sm:text-sm"
              >
                {t("nav.analyze")}
              </button>
            </form>

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
                  <button
                    key={href}
                    type="button"
                    onClick={() => closeMenuAndNavigate(href)}
                    className={`font-pixel flex w-full items-center px-4 py-3 text-left text-sm font-medium pixel-btn ${
                      active
                        ? "bg-chess-accent/18 text-chess-accent border-chess-accent/45"
                        : "text-chess-muted hover:text-chess-primary bg-transparent"
                    }`}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
