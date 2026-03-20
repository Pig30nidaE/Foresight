"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
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

/**
 * 브라우저 로케일 기준 초기 언어 (IP/국가 아님 — OS·Safari/Chrome 언어 설정을 따름).
 * - 목록에서 가장 먼저 나오는 태그가 한국어(`ko`, `ko-KR`…)면 한국어
 * - 그 외 → 영어
 * Safari에서 영어로 보이게 하려면: 설정 → 언어 → English를 **맨 위**로 두기.
 */
export function inferLanguageFromNavigator(): Language {
  if (typeof navigator === "undefined") return DEFAULT_SETTINGS.language;
  const candidates = [
    navigator.language,
    ...(navigator.languages ?? []),
    // Safari/일부 환경에서 보조 (선호 언어 목록이 비었을 때)
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().locale
      : "",
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
  for (const tag of candidates) {
    const lower = tag.toLowerCase();
    if (lower === "ko" || lower.startsWith("ko-")) return "ko";
  }
  return "en";
}

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
  /** 로케일 자동 선택이 끝나기 전에 sessionStorage에 기본값을 쓰면 감지가 스킵되므로 게이트 */
  const localeResolved = useRef(false);

  const setLanguage = (lang: Language) => setSettings((prev) => ({ ...prev, language: lang }));
  const setTheme = (next: Theme) => setSettings((prev) => ({ ...prev, theme: next }));
  const setStockfishDepth = (depth: number) =>
    setSettings((prev) => ({ ...prev, stockfishDepth: depth }));

  // 세션에 설정이 없을 때만: 브라우저 로케일로 언어 자동 (paint 전에 반영)
  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      localeResolved.current = true;
      return;
    }
    let hasStored = false;
    try {
      hasStored = Boolean(sessionStorage.getItem(SESSION_SETTINGS_KEY));
    } catch {
      // Private 모드 등에서 getItem이 실패해도 기본 ko에 고정하지 않고 로케일 추론
      hasStored = false;
    }
    if (hasStored) {
      localeResolved.current = true;
      return;
    }
    setSettings((prev) => ({ ...prev, language: inferLanguageFromNavigator() }));
    localeResolved.current = true;
  }, []);

  // 테마는 paint 전에 반영해 깜빡임 최소화
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!localeResolved.current) return;
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
