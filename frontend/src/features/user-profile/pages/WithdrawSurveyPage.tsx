"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { getBackendJwt } from "@/shared/lib/backendJwt";
import { useTranslation } from "@/shared/lib/i18n";
import { withdrawMyAccount, type WithdrawReasonCode } from "@/features/user-profile/api";

const WITHDRAW_REASON_OPTIONS: ReadonlyArray<{
  value: WithdrawReasonCode;
  labelKey:
    | "mypage.withdraw.reason.privacyConcern"
    | "mypage.withdraw.reason.lowUsage"
    | "mypage.withdraw.reason.serviceQuality"
    | "mypage.withdraw.reason.bugsOrPerformance"
    | "mypage.withdraw.reason.movingToOtherService"
    | "mypage.withdraw.reason.other";
}> = [
  { value: "low_usage", labelKey: "mypage.withdraw.reason.lowUsage" },
  { value: "service_quality", labelKey: "mypage.withdraw.reason.serviceQuality" },
  { value: "bugs_or_performance", labelKey: "mypage.withdraw.reason.bugsOrPerformance" },
  { value: "moving_to_other_service", labelKey: "mypage.withdraw.reason.movingToOtherService" },
  { value: "other", labelKey: "mypage.withdraw.reason.other" },
  { value: "privacy_concern", labelKey: "mypage.withdraw.reason.privacyConcern" },
];

export default function WithdrawSurveyPage() {
  const router = useRouter();
  const { status } = useSession();
  const { t } = useTranslation();
  const [withdrawReason, setWithdrawReason] = useState<WithdrawReasonCode>("low_usage");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawFeedback, setWithdrawFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/api/auth/signin?callbackUrl=%2Fpost-login");
    }
  }, [status, router]);

  const onWithdrawAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(t("mypage.withdraw.confirm"))) {
      return;
    }

    setWithdrawBusy(true);
    setError(null);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error(t("forum.error.noLoginToken"));
      await withdrawMyAccount(token, {
        reason_code: withdrawReason,
        additional_feedback: withdrawFeedback.trim() || null,
      });
      await signOut({ callbackUrl: "/" });
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg = typeof d === "string" ? d : e?.message ?? t("mypage.error.withdraw");
      setError(msg);
    } finally {
      setWithdrawBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl space-y-4">
      <div className="space-y-1">
        <h1 className="font-pixel text-2xl font-bold tracking-wide text-chess-primary">{t("mypage.withdraw.title")}</h1>
        <p className="text-sm text-chess-muted">{t("mypage.withdraw.desc")}</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 pixel-frame pixel-hud-fill px-3 py-2 border-red-500/40">
          {error}
        </p>
      )}

      <form
        onSubmit={onWithdrawAccount}
        className="space-y-3 border-2 border-red-500/40 bg-red-500/5 px-4 py-4 sm:px-5"
      >
        <label className="block text-sm font-medium text-chess-primary">{t("mypage.withdraw.reasonLabel")}</label>
        <select
          className="w-full px-3 py-2 text-sm text-chess-primary pixel-input"
          value={withdrawReason}
          onChange={(e) => setWithdrawReason(e.target.value as WithdrawReasonCode)}
          disabled={withdrawBusy}
        >
          {WITHDRAW_REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-sm font-medium text-chess-primary">
          {t("mypage.withdraw.additionalFeedbackLabel")}
        </label>
        <textarea
          rows={4}
          maxLength={2000}
          value={withdrawFeedback}
          onChange={(e) => setWithdrawFeedback(e.target.value)}
          disabled={withdrawBusy}
          placeholder={t("mypage.withdraw.additionalFeedbackPlaceholder")}
          className="w-full resize-y px-3 py-2 text-sm text-chess-primary pixel-input"
        />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={withdrawBusy}
            className="font-pixel px-4 py-2 text-xs font-semibold text-white bg-red-600 pixel-btn disabled:opacity-50"
          >
            {withdrawBusy ? t("mypage.withdraw.processing") : t("mypage.withdraw.button")}
          </button>
          <Link
            href="/mypage"
            className="font-pixel px-3 py-2 text-xs font-medium text-chess-primary pixel-btn bg-chess-surface/80"
          >
            {t("mypage.withdraw.cancel")}
          </Link>
        </div>
      </form>
    </section>
  );
}
