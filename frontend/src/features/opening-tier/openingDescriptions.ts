/**
 * Opening main-idea descriptions.
 *
 * Keep Korean copy intact where already authored, and provide English copy for
 * language switching in the opening-tier modal.
 */
export type OpeningDescription = {
  ko: string;
  en: string;
};

export const OPENING_DESCRIPTIONS: Record<string, OpeningDescription> = {
  "Nimzo-Larsen Attack": {
    ko: "백이 1.b3으로 퀸사이드 비숍을 b2에 피앙케토하여 긴 대각선을 장악하고, 멀리서 중앙을 압박하는 비정규 전략입니다.",
    en: "White fianchettos the queen-side bishop with 1.b3, aiming for long-diagonal control and indirect pressure against the center.",
  },
  "Bird's Opening": {
    ko: "백이 1.f4로 e5를 억제하며 킹사이드 주도권을 노리는 오프닝입니다. 공격적이지만 킹 안전이 느슨해질 수 있습니다.",
    en: "White uses 1.f4 to control e5 and seek king-side initiative. It is aggressive, but king safety can become looser.",
  },
  "Reti Opening": {
    ko: "백이 폰보다 기물로 중앙을 통제하며, 유연한 전개와 하이퍼모던 운영을 노리는 오프닝입니다.",
    en: "White controls the center with pieces rather than pawns, aiming for flexible development and a hypermodern structure.",
  },
  "Budapest Gambit": {
    ko: "흑이 빠른 기물 전개와 주도권을 위해 폰을 희생하며 백의 중앙을 압박하는 갬빗입니다.",
    en: "Black sacrifices a pawn for rapid development and initiative while challenging White's center immediately.",
  },
  "Benko Gambit": {
    ko: "흑이 퀸사이드 파일과 대각선을 열어 장기적인 압박을 노리고 폰을 희생하는 전략입니다.",
    en: "Black gives up a pawn to open queen-side files and diagonals for long-term positional pressure.",
  },
  "Dutch Defense": {
    ko: "흑이 1...f5로 e4를 제어하며 킹사이드 주도권을 노립니다. 역동적이지만 킹 안전의 대가가 따릅니다.",
    en: "Black uses 1...f5 to control e4 and seek king-side initiative. It is dynamic, but king safety can be the trade-off.",
  },
  "Starting Position": {
    ko: "첫 수 전의 출발점으로, 중앙 장악·기물 전개·킹 안전이라는 기본 원칙을 어떻게 실현할지 결정하는 상태입니다.",
    en: "This is the starting point before the first move, where the basic goals of central control, development, and king safety are decided.",
  },
  "English Opening": {
    ko: "백이 측면에서 중앙을 압박하며 긴 대각선과 유연한 구조를 노리는 포지셔널 오프닝입니다.",
    en: "White pressures the center from the flank, aiming for long-diagonal control and a flexible positional setup.",
  },
  "Indian Defense": {
    ko: "흑이 즉시 폰으로 중앙을 점유하지 않고, 나중에 측면에서 중앙을 흔드는 하이퍼모던 계열의 뼈대입니다.",
    en: "Black does not occupy the center immediately with pawns, instead planning to undermine it later from the flanks in hypermodern style.",
  },
  "King's Pawn Game": {
    ko: "백이 1.e4로 중앙과 전개를 동시에 열며 가장 직접적으로 주도권을 노리는 출발입니다.",
    en: "White opens with 1.e4 to claim central space and development routes immediately in the most direct way.",
  },
  "Scandinavian Defense": {
    ko: "흑이 즉시 중앙 교환을 유도해 구조를 단순화하고 빠른 전개를 노리는 수비입니다.",
    en: "Black immediately challenges the center, often simplifying the structure and seeking rapid development.",
  },
  "Alekhine's Defense": {
    ko: "흑이 백의 폰 중앙을 전진시키도록 유도한 뒤, 과확장된 구조를 나중에 공격하는 오프닝입니다.",
    en: "Black invites White to overextend the pawn center and plans to attack that expanded structure later.",
  },
  "Modern Defense": {
    ko: "흑이 피앙케토와 유연한 배치로 버티다가, 중앙을 나중에 역습하는 하이퍼모던 수비입니다.",
    en: "Black fianchettos and stays flexible, planning a later counterattack against the center in hypermodern fashion.",
  },
  "Pirc Defense": {
    ko: "흑이 견고한 구조를 먼저 세운 뒤, 백의 넓은 중앙을 측면에서 흔드는 탄력적인 방어입니다.",
    en: "Black builds a compact structure first and then tries to undermine White's broad center from the flanks.",
  },
  "Caro-Kann Defense": {
    ko: "흑이 단단한 폰 구조와 안정적인 전개를 바탕으로 장기전을 노리는 대표적인 수비입니다.",
    en: "Black aims for a durable pawn structure and reliable development, often steering toward a sound long game.",
  },
  "Sicilian Defense": {
    ko: "흑이 c5로 비대칭 구조를 만들며 복잡한 전투와 퀸사이드 반격을 노리는 대표적인 공격적 수비입니다.",
    en: "Black uses ...c5 to create an asymmetrical struggle, often aiming for complex play and queen-side counterplay.",
  },
  "French Defense": {
    ko: "흑이 견고한 중앙 폰 사슬을 세우고, 백의 중심을 측면에서 무너뜨리려는 전략적 수비입니다.",
    en: "Black builds a solid central pawn chain and tries to undermine White's center from the side.",
  },
  "Italian Game": {
    ko: "백이 비숍을 적극적으로 전개해 f7를 노리며, 빠른 전개와 중앙 장악을 동시에 노리는 정석 오프닝입니다.",
    en: "White develops the bishop actively toward f7, combining rapid development with central ambition in a classical opening.",
  },
  "Ruy Lopez": {
    ko: "백이 흑의 e5 방어 기물을 간접적으로 압박하며 장기적인 구조 우위를 노리는 매우 전략적인 오프닝입니다.",
    en: "White indirectly pressures Black's defender of e5 and aims for a long-term structural edge in this deeply strategic opening.",
  },
  "Queen's Pawn Game": {
    ko: "백이 d4로 출발해 닫힌 구조와 장기적인 기물 운영을 지향하는 전형적인 출발입니다.",
    en: "White starts with d4, often heading toward closed structures and long-term piece play.",
  },
  "London System": {
    ko: "백이 견고한 폰 구조와 안정적인 전개를 우선하며, 상대 대응과 무관하게 비슷한 틀을 유지하는 시스템입니다.",
    en: "White prioritizes a solid pawn structure and smooth development, often keeping a familiar setup regardless of Black's reply.",
  },
  "Queen's Gambit": {
    ko: "백이 c4로 흑의 중앙을 흔들며 장기적인 중앙 우위를 노리는 대표적인 포지셔널 오프닝입니다.",
    en: "White uses c4 to challenge Black's center and aims for enduring positional pressure and central influence.",
  },
  "Slav Defense": {
    ko: "흑이 d5를 튼튼하게 지키면서도 비숍 전개 자유를 유지하려는 매우 실전적인 수비입니다.",
    en: "Black supports d5 while preserving bishop freedom, making this a very practical and resilient defense.",
  },
  "Queen's Gambit Accepted": {
    ko: "흑이 폰을 받아들인 뒤 빠른 전개와 중앙 역습으로 균형을 맞추려는 수비입니다.",
    en: "Black accepts the pawn and seeks balance through fast development and later central counterplay.",
  },
  "Queen's Gambit Declined": {
    ko: "흑이 폰 구조를 유지하며 백의 압박을 견디고, 안정적인 운영으로 반격 기회를 찾는 정통 수비입니다.",
    en: "Black keeps the pawn structure intact, absorbs pressure, and looks for counterplay through solid classical development.",
  },
  "Grunfeld Defense": {
    ko: "흑이 백의 거대한 중앙을 허용한 뒤, 기물과 폰으로 그 중심을 직접 공격하는 공격적 하이퍼모던 수비입니다.",
    en: "Black allows White a broad center first, then attacks it directly with pieces and pawns in a sharp hypermodern defense.",
  },
  "Catalan Opening": {
    ko: "백이 긴 대각선의 비숍 압박과 포지셔널 우위를 통해 서서히 주도권을 쌓는 세련된 오프닝입니다.",
    en: "White builds pressure with a long-diagonal bishop and accumulates positional pressure in a refined opening system.",
  },
  "Nimzo-Indian Defense": {
    ko: "흑이 핀과 구조 손상을 노리며 백의 중앙과 기물 전개를 교란하는 대표적인 전략 수비입니다.",
    en: "Black uses pinning ideas and structural pressure to disrupt White's center and development in this major strategic defense.",
  },
  "King's Indian Defense": {
    ko: "흑이 공간은 양보하되, 나중에 킹사이드에서 강한 역공을 노리는 매우 날카로운 수비입니다.",
    en: "Black yields space early but aims for a fierce king-side counterattack later in the game.",
  },
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function getOpeningDescription(name: string): OpeningDescription | null {
  if (OPENING_DESCRIPTIONS[name]) return OPENING_DESCRIPTIONS[name];

  const normalized = stripAccents(name);
  if (OPENING_DESCRIPTIONS[normalized]) return OPENING_DESCRIPTIONS[normalized];

  const base = name.split(":")[0].trim();
  if (base !== name && OPENING_DESCRIPTIONS[base]) return OPENING_DESCRIPTIONS[base];

  const baseNormalized = stripAccents(base);
  if (baseNormalized !== base && OPENING_DESCRIPTIONS[baseNormalized]) {
    return OPENING_DESCRIPTIONS[baseNormalized];
  }

  return null;
}
