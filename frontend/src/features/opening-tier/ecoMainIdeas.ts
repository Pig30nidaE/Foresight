import type { Color } from "./types";
import enCatalog from "./eco_main_ideas_en.json";
import koCatalog from "./eco_main_ideas_ko.json";

type SidePayload = { white: string[]; black: string[] };
type Catalog = Record<string, SidePayload>;

const KO = koCatalog as Catalog;
const EN = enCatalog as Catalog;

export type UiLang = "ko" | "en";

/**
 * ECO(대문자) + 진영(티어 표는 화이트/블랙 시점)으로 메인 아이디어 불릿 목록 조회.
 */
export function getEcoMainIdeaBullets(eco: string, side: Color, language: UiLang): string[] | null {
  const key = eco.trim().toUpperCase();
  if (!key) return null;
  const table = language === "en" ? EN : KO;
  const row = table[key];
  if (!row) return null;
  const bullets = side === "black" ? row.black : row.white;
  if (!Array.isArray(bullets) || bullets.length === 0) return null;
  return bullets;
}
