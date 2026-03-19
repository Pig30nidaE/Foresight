import { useSettings } from "./SettingsContext";
import { useTranslation } from "../../lib/i18n";
import { useState } from "react";

const DEPTH_OPTIONS = [12, 15, 18, 20, 22];

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language, setLanguage, theme, setTheme, stockfishDepth, setStockfishDepth } = useSettings();
  const { t } = useTranslation();
  const [draftLang, setDraftLang] = useState(language);
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftDepth, setDraftDepth] = useState(stockfishDepth);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20">
      <div className="bg-white dark:bg-chess-bg border border-chess-border rounded-lg shadow-lg mt-20 mr-8 w-80 p-6 flex flex-col gap-6">
        <h2 className="font-bold text-lg mb-2">{t("settings.title")}</h2>
        {/* 언어 선택 */}
        <div>
          <label className="block font-medium mb-1">{t("settings.language")}</label>
          <select
            className="w-full border rounded px-2 py-1 bg-chess-surface"
            value={draftLang}
            onChange={e => setDraftLang(e.target.value as any)}
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </div>
        {/* 테마 선택 */}
        <div>
          <label className="block font-medium mb-1">{t("settings.theme")}</label>
          <select
            className="w-full border rounded px-2 py-1 bg-chess-surface"
            value={draftTheme}
            onChange={e => setDraftTheme(e.target.value as any)}
          >
            <option value="light">{t("settings.theme.light")}</option>
            <option value="dark">{t("settings.theme.dark")}</option>
          </select>
        </div>
        {/* Stockfish Depth 선택 */}
        <div>
          <label className="block font-medium mb-1">{t("settings.depth")}</label>
          <select
            className="w-full border rounded px-2 py-1 bg-chess-surface"
            value={draftDepth}
            onChange={e => setDraftDepth(Number(e.target.value))}
          >
            {DEPTH_OPTIONS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <div className="text-xs text-chess-muted mt-1">{t("settings.depthHint")}</div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button
            className="px-3 py-1 rounded bg-chess-border text-chess-primary hover:bg-chess-accent/20"
            onClick={onClose}
          >
            {t("settings.cancel")}
          </button>
          <button
            className="px-3 py-1 rounded bg-chess-accent text-white hover:bg-chess-accent/80"
            onClick={() => {
              setLanguage(draftLang);
              setTheme(draftTheme);
              setStockfishDepth(draftDepth);
              onClose();
            }}
          >
            {t("settings.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
