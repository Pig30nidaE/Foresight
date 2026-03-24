"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  ReactNode,
} from "react";
import { useSession } from "next-auth/react";

export type Language = "ko" | "en";
export type Theme = "light" | "dark";

export interface Settings {
  language: Language;
  theme: Theme;
  stockfishDepth: number;
}

/** 계정별 설정 저장 키 prefix (localStorage) */
const USER_SETTINGS_KEY_PREFIX = "foresight.user.settings";
const GUEST_SETTINGS_KEY = `${USER_SETTINGS_KEY_PREFIX}.guest`;

const DEFAULT_SETTINGS: Settings = {
  language: "ko",
  theme: "light",
  stockfishDepth: 12,
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

function readPersistedSettings(storageKey: string): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const language = isLanguage(o.language) ? o.language : DEFAULT_SETTINGS.language;
    const theme = isTheme(o.theme) ? o.theme : DEFAULT_SETTINGS.theme;
    const d = Math.round(Number(o.stockfishDepth));
    const stockfishDepth = [12, 18, 24].includes(d) ? d : DEFAULT_SETTINGS.stockfishDepth;
    return { language, theme, stockfishDepth };
  } catch {
    return null;
  }
}

function writePersistedSettings(storageKey: string, s: Settings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

function resolveSettingsStorageKey(identity: string | null): string {
  if (!identity) return GUEST_SETTINGS_KEY;
  return `${USER_SETTINGS_KEY_PREFIX}.${encodeURIComponent(identity.trim().toLowerCase())}`;
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
  const { status, data: session } = useSession();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [storageKey, setStorageKey] = useState<string>(GUEST_SETTINGS_KEY);
  const [hydrated, setHydrated] = useState(false);
  const { language, theme, stockfishDepth } = settings;

  const setLanguage = (lang: Language) => setSettings((prev) => ({ ...prev, language: lang }));
  const setTheme = (next: Theme) => setSettings((prev) => ({ ...prev, theme: next }));
  const setStockfishDepth = (depth: number) =>
    setSettings((prev) => ({ ...prev, stockfishDepth: depth }));

  // 로그인 사용자별(또는 guest) 설정 로드
  useEffect(() => {
    if (status === "loading") return;
    const identity =
      session?.user?.email ??
      session?.user?.name ??
      null;
    const key = resolveSettingsStorageKey(identity);
    setStorageKey(key);

    const stored = readPersistedSettings(key);
    if (stored) {
      setSettings(stored);
    } else {
      setSettings({
        ...DEFAULT_SETTINGS,
        language: inferLanguageFromNavigator(),
      });
    }
    setHydrated(true);
  }, [status, session?.user?.email, session?.user?.name]);

  // 테마는 paint 전에 반영해 깜빡임 최소화
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!hydrated) return;
    writePersistedSettings(storageKey, settings);
  }, [hydrated, settings, storageKey]);

  return (
    <SettingsContext.Provider
      value={{ language, theme, stockfishDepth, setLanguage, setTheme, setStockfishDepth }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
