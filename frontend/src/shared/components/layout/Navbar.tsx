"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, Menu, X, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsModal from "../settings/SettingsModal";
import { useTranslation } from "../../lib/i18n";

const NAV_ITEMS = [
  { href: "/opening-tier", labelKey: "nav.openingTier" as const },
  { href: "/dashboard",    labelKey: "nav.dashboard" as const },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    router.push(`/dashboard?platform=chess.com&username=${encodeURIComponent(username.trim())}`);
    setUsername("");
    setMenuOpen(false);
  };

  return (
    <>
      <header className="border-b border-chess-border/60 bg-chess-bg/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">

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
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV_ITEMS.map(({ href, labelKey }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-chess-accent text-white"
                      : "text-chess-muted hover:text-chess-primary hover:bg-chess-border/50"
                  }`}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>

          {/* ── 데스크톱 검색 + 설정 (md 이상) ── */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <button
              type="button"
              className="p-2 rounded-full hover:bg-chess-border/40 transition-colors"
              aria-label="설정"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings size={20} />
            </button>

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
          <div className="flex md:hidden items-center gap-1">
            <button
              type="button"
              className="p-2.5 rounded-full hover:bg-chess-border/40 transition-colors"
              aria-label="설정"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings size={20} />
            </button>
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

            {/* 네비 링크 */}
            <nav className="space-y-1">
              {NAV_ITEMS.map(({ href, labelKey }) => {
                const active = pathname.startsWith(href);
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

      {/* 설정 모달 (공통) */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
