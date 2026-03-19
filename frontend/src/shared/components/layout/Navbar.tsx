"use client";



import { useState } from "react";
import { Settings } from "lucide-react";

import Link from "next/link";

import { usePathname, useRouter } from "next/navigation";

import SettingsModal from "../settings/SettingsModal";
import { useTranslation } from "../../lib/i18n";



// We will translate these keys inside the component
const NAV_ITEMS = [
  { href: "/opening-tier", labelKey: "nav.openingTier" as const },
  { href: "/dashboard",    labelKey: "nav.dashboard" as const },
];



export default function Navbar() {

  const pathname = usePathname();

  const router = useRouter();

  const [username, setUsername] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);

  const { t } = useTranslation();



  const handleSearch = (e: React.FormEvent) => {

    e.preventDefault();

    if (!username.trim()) return;

    router.push(`/dashboard?platform=chess.com&username=${encodeURIComponent(username.trim())}`);

    setUsername("");

  };



  return (

    <header className="border-b border-chess-border/60 bg-chess-bg/80 backdrop-blur-md sticky top-0 z-50">

      <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between gap-6">

        {/* Logo + Nav */}

        <div className="flex items-center gap-8 shrink-0">

          <Link href="/" className="flex items-center gap-1.5 font-bold text-lg tracking-tight select-none">

            <span className="text-xl leading-none">♟️</span>

            <span className="text-chess-primary">Fore</span>

            <span className="text-chess-accent">sight</span>

          </Link>



          {/* Nav Links */}

          <nav className="flex items-center gap-1 text-sm">

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

        </div>



        {/* Search Bar + Settings */}

        <div className="flex items-center gap-3 shrink-0">
          {/* Settings Button */}
          <button
            type="button"
            className="p-2 rounded-full hover:bg-chess-border/40 transition-colors"
            aria-label="설정"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings size={22} />
          </button>

          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

          {/* Search Bar */}
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

      </div>

    </header>

  );

}

