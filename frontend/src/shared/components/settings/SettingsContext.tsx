import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "ko" | "en";
export type Theme = "light" | "dark";

export interface Settings {
  language: Language;
  theme: Theme;
  stockfishDepth: number;
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
  const [language, setLanguage] = useState<Language>("ko");
  const [theme, setTheme] = useState<Theme>("light");
  const [stockfishDepth, setStockfishDepth] = useState<number>(18);

  return (
    <SettingsContext.Provider
      value={{ language, theme, stockfishDepth, setLanguage, setTheme, setStockfishDepth }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
