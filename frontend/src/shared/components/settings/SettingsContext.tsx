"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  ReactNode,
} from "react";

export type Language = "ko" | "en";
export type Theme = "light" | "dark";

export interface Settings {
  language: Language;
  theme: Theme;
  stockfishDepth: number;
}

/** 탭/창을 닫을 때까지 유지 (브라우저 세션 캐시) */
const SESSION_SETTINGS_KEY = "foresight.session.settings";

const DEFAULT_SETTINGS: Settings = {
  language: "ko",
  theme: "light",
  stockfishDepth: 18,
};

function isLanguage(v: unknown): v is Language {
  return v === "ko" || v === "en";
}

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}

function readSessionSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = sessionStorage.getItem(SESSION_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const language = isLanguage(o.language) ? o.language : DEFAULT_SETTINGS.language;
    const theme = isTheme(o.theme) ? o.theme : DEFAULT_SETTINGS.theme;
    const d = Number(o.stockfishDepth);
    const stockfishDepth =
      Number.isFinite(d) && d >= 12 && d <= 48 ? Math.round(d) : DEFAULT_SETTINGS.stockfishDepth;
    return { language, theme, stockfishDepth };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSessionSettings(s: Settings) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

interface SettingsContextProps extends Settings {
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  setStockfishDepth: (depth: number) => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => readSessionSettings());
  const { language, theme, stockfishDepth } = settings;

  const setLanguage = (lang: Language) => setSettings((prev) => ({ ...prev, language: lang }));
  const setTheme = (next: Theme) => setSettings((prev) => ({ ...prev, theme: next }));
  const setStockfishDepth = (depth: number) =>
    setSettings((prev) => ({ ...prev, stockfishDepth: depth }));

  // 테마는 paint 전에 반영해 깜빡임 최소화
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    writeSessionSettings(settings);
  }, [settings]);

  return (
    <SettingsContext.Provider
      value={{ language, theme, stockfishDepth, setLanguage, setTheme, setStockfishDepth }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
