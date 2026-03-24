"use client";

import { useTranslation } from "@/shared/lib/i18n";

export default function CommunityPageHeader({ variant }: { variant: "forum" | "board" }) {
  const { t } = useTranslation();
  const titleKey = variant === "forum" ? "nav.forum" : "nav.board";

  return (
    <header className="pixel-frame bg-chess-surface/65 px-4 py-4 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-wide text-chess-muted">{t("community.section")}</p>
      <h1 className="mt-1 text-2xl font-bold text-chess-primary">{t(titleKey)}</h1>
    </header>
  );
}
