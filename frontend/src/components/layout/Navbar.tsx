import Link from "next/link";

export default function Navbar() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span className="text-2xl">♟️</span>
          <span className="text-white">Fore</span>
          <span className="text-emerald-400">sight</span>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-6 text-sm text-zinc-400">
          <Link href="/dashboard" className="hover:text-white transition-colors">
            대시보드
          </Link>
          <Link href="/analysis" className="hover:text-white transition-colors">
            내 게임 분석
          </Link>
          <Link href="/opponent" className="hover:text-white transition-colors">
            상대 분석
          </Link>
        </nav>
      </div>
    </header>
  );
}
