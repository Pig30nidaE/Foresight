"use client";

import { SIGNUP_TERMS_SECTIONS } from "@/shared/content/signupTerms";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function TermsModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-terms-title"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-chess-border bg-chess-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-chess-border px-4 py-3">
          <h2 id="signup-terms-title" className="text-lg font-semibold text-chess-primary">
            이용약관·개인정보·커뮤니티 규칙
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-chess-muted hover:bg-chess-bg hover:text-chess-primary"
          >
            닫기
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3 text-sm text-chess-primary">
          {SIGNUP_TERMS_SECTIONS.map((s) => (
            <section key={s.title} className="mb-5 last:mb-0">
              <h3 className="font-semibold text-chess-accent">{s.title}</h3>
              <p className="mt-2 whitespace-pre-line text-chess-muted">{s.body}</p>
            </section>
          ))}
        </div>
        <div className="border-t border-chess-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-chess-accent py-2 text-sm font-semibold text-white"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
