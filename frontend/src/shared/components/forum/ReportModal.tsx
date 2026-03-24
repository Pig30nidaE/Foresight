"use client";

import { FormEvent, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export function ReportModal({ open, title, busy, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const t = reason.trim();
    if (t.length < 5) {
      setLocalError("사유는 5자 이상 입력해 주세요.");
      return;
    }
    try {
      await onSubmit(t);
      setReason("");
      onClose();
    } catch {
      /* parent shows error; keep dialog open */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-xl border border-chess-border bg-chess-surface p-4 shadow-lg"
      >
        <h2 id="report-modal-title" className="text-lg font-semibold text-chess-primary">
          {title}
        </h2>
        <p className="mt-1 text-xs text-chess-muted">신고 사유를 입력해 주세요. (5–500자)</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={500}
          className="mt-3 w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm text-chess-primary"
          placeholder="예: 욕설, 스팸, 개인정보 노출 등"
        />
        {localError && <p className="mt-2 text-sm text-red-500">{localError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setReason("");
              setLocalError(null);
              onClose();
            }}
            className="rounded-md border border-chess-border px-3 py-2 text-sm text-chess-primary"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-chess-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "전송 중…" : "신고하기"}
          </button>
        </div>
      </form>
    </div>
  );
}
