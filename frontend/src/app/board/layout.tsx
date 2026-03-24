import type { ReactNode } from "react";

import CommunityPageHeader from "@/shared/components/layout/CommunityPageHeader";

export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <CommunityPageHeader variant="board" />
      <div className="min-h-[12rem]">{children}</div>
    </div>
  );
}
