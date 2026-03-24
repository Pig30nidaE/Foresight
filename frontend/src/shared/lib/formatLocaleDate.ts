import type { Language } from "@/shared/components/settings/SettingsContext";

const BCP47: Record<Language, string> = { ko: "ko-KR", en: "en-US" };

/** 글·댓글 메타 등 날짜+시간 (영어: AM/PM, 한국어: 오전/오후) */
export function formatPostDateTime(value: string | number | Date, language: Language): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(BCP47[language], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/** 목록용 날짜만 */
export function formatPostDate(value: string | number | Date, language: Language): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(BCP47[language], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
