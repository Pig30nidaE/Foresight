import type { ReactNode } from "react";

import CommunityPageHeader from "@/shared/components/layout/CommunityPageHeader";

export default function ForumLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <CommunityPageHeader variant="forum" />
      <div className="min-h-[12rem]">{children}</div>
    </div>
  );
}
