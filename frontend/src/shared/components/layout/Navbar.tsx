"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard",    label: "대시보드" },
  { href: "/analysis",     label: "내 게임 분석" },
  { href: "/opponent",     label: "상대 분석" },
  { href: "/opening-tier", label: "오프닝 티어표" },
  { href: "/community",    label: "커뮤니티" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-chess-border bg-chess-bg/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 font-bold text-lg tracking-tight select-none">
          <span className="text-xl leading-none">♟️</span>
          <span className="text-chess-primary">Fore</span>
          <span className="text-chess-accent">sight</span>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1 text-sm">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md transition-colors font-medium ${
                  active
                    ? "bg-chess-border text-chess-primary"
                    : "text-chess-muted hover:text-chess-primary hover:bg-chess-border/50"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
