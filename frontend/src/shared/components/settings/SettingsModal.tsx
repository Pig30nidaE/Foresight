import { useSettings, type Language, type Theme } from "./SettingsContext";
import { useTranslation } from "../../lib/i18n";
import { useState, useEffect, useRef } from "react";

const DEPTH_OPTIONS = [12, 18, 24];

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language, setLanguage, theme, setTheme, stockfishDepth, setStockfishDepth } = useSettings();
  const { t } = useTranslation();
  const [draftLang, setDraftLang] = useState(language);
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftDepth, setDraftDepth] = useState(stockfishDepth);
  const [savedFlash, setSavedFlash] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftLang(language);
    setDraftTheme(theme);
    setDraftDepth(stockfishDepth);
    setSavedFlash(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [open, language, theme, stockfishDepth]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!open) return null;

  const onApply = () => {
    setLanguage(draftLang);
    setTheme(draftTheme);
    setStockfishDepth(draftDepth);
    setSavedFlash(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setSavedFlash(false);
      onClose();
    }, 1600);
  };

  const closeAndClearTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSavedFlash(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/25 dark:bg-black/55 backdrop-blur-[2px]"
      onClick={closeAndClearTimer}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-chess-surface dark:bg-chess-elevated border border-chess-border dark:border-chess-border rounded-xl shadow-xl dark:shadow-[0_24px_48px_rgba(0,0,0,0.5)] mt-20 mr-4 sm:mr-8 w-[min(100vw-1.5rem,20rem)] p-6 flex flex-col gap-6 ring-1 ring-black/5 dark:ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-lg mb-2 text-chess-primary">{t("settings.title")}</h2>
        {/* 언어 선택 */}
        <div>
          <label className="block font-medium mb-1 text-chess-primary">{t("settings.language")}</label>
          <select
            className="w-full border border-chess-border rounded-lg px-2 py-2 bg-chess-bg dark:bg-chess-bg text-chess-primary text-sm focus:outline-none focus:ring-2 focus:ring-chess-accent/30"
            value={draftLang}
            onChange={(e) => setDraftLang(e.target.value as Language)}
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </div>
        {/* 테마 선택 */}
        <div>
          <label className="block font-medium mb-1 text-chess-primary">{t("settings.theme")}</label>
          <select
            className="w-full border border-chess-border rounded-lg px-2 py-2 bg-chess-bg dark:bg-chess-bg text-chess-primary text-sm focus:outline-none focus:ring-2 focus:ring-chess-accent/30"
            value={draftTheme}
            onChange={(e) => setDraftTheme(e.target.value as Theme)}
          >
            <option value="light">{t("settings.theme.light")}</option>
            <option value="dark">{t("settings.theme.dark")}</option>
          </select>
        </div>
        {/* Stockfish Depth 선택 */}
        <div>
          <label className="block font-medium mb-1 text-chess-primary">{t("settings.depth")}</label>
          <select
            className="w-full border border-chess-border rounded-lg px-2 py-2 bg-chess-bg dark:bg-chess-bg text-chess-primary text-sm focus:outline-none focus:ring-2 focus:ring-chess-accent/30"
            value={draftDepth}
            onChange={(e) => setDraftDepth(Number(e.target.value))}
          >
            {DEPTH_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="text-xs text-chess-muted mt-1">{t("settings.depthHint")}</div>
        </div>
        {savedFlash && (
          <p className="text-sm font-medium text-chess-win" role="status">
            {t("settings.saved")}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-chess-border/50 dark:bg-chess-bg text-chess-primary hover:bg-chess-border dark:hover:bg-chess-surface border border-chess-border/60"
            onClick={closeAndClearTimer}
          >
            {t("settings.cancel")}
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-chess-accent text-white hover:bg-chess-accent/90 dark:shadow-[0_0_20px_-4px_rgba(196,165,116,0.45)]"
            onClick={onApply}
          >
            {t("settings.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
