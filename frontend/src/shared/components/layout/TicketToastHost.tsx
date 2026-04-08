"use client";

import { useEffect, useMemo, useState } from "react";

import { useTranslation } from "@/shared/lib/i18n";
import { TICKET_TOAST_EVENT, type TicketToastEventDetail } from "@/shared/lib/ticketToast";

type ActiveToast = {
  id: number;
  message: string;
  cooldownSeconds: number;
};

const AUTO_HIDE_MS = 3000;
const FADE_OUT_MS = 280;

export default function TicketToastHost() {
  const { t } = useTranslation();
  const [active, setActive] = useState<ActiveToast | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const onToast = (event: Event) => {
      const custom = event as CustomEvent<TicketToastEventDetail>;
      const detail = custom.detail ?? {};
      setActive({
        id: Date.now(),
        message: detail.message?.trim() ?? "",
        cooldownSeconds: Math.max(0, Math.floor(detail.cooldownSeconds ?? 0)),
      });
      setIsFadingOut(false);
    };

    window.addEventListener(TICKET_TOAST_EVENT, onToast as EventListener);
    return () => window.removeEventListener(TICKET_TOAST_EVENT, onToast as EventListener);
  }, []);

  useEffect(() => {
    const toastId = active?.id;
    if (!toastId) return;
    const fadeTimer = window.setTimeout(() => setIsFadingOut(true), AUTO_HIDE_MS);
    const removeTimer = window.setTimeout(
      () => setActive((prev) => (prev?.id === toastId ? null : prev)),
      AUTO_HIDE_MS + FADE_OUT_MS,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [active?.id]);

  useEffect(() => {
    if (!active?.id || active.cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setActive((prev) => {
        if (!prev) return prev;
        if (prev.cooldownSeconds <= 0) return prev;
        return { ...prev, cooldownSeconds: prev.cooldownSeconds - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active?.id]);

  const cooldownText = useMemo(() => {
    if (!active || active.cooldownSeconds <= 0) return "";
    const mm = Math.floor(active.cooldownSeconds / 60);
    const ss = active.cooldownSeconds % 60;
    return t("ticket.nextAvailableIn")
      .replace("{mm}", String(mm))
      .replace("{ss}", String(ss).padStart(2, "0"));
  }, [active, t]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[120] w-[min(92vw,34rem)] -translate-x-1/2 sm:top-16">
      <div
        className={`pointer-events-auto pixel-frame border-chess-win/50 bg-chess-bg/95 px-4 py-3 shadow-xl animate-fade-in transition-opacity duration-300 ${
          isFadingOut ? "opacity-0" : "opacity-100"
        }`}
      >
        <p className="font-pixel text-sm font-semibold text-chess-win">
          {active.message || t("ticket.cooldown.active")}
        </p>
        {cooldownText ? (
          <p className="mt-1 text-xs text-chess-primary/85">{cooldownText}</p>
        ) : null}
      </div>
    </div>
  );
}
