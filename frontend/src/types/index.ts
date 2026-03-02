// ============================================================
// Foresight 공용 타입 — 하위 호환성 배럴 파일
// 기존 코드에서 @/types 로 import 시 계속 동작합니다.
// 새 타입은 해당 기능 폴더의 types.ts 에 정의하세요:
//   - Dashboard: src/features/dashboard/types.ts
//   - Opponent:  src/features/opponent/types.ts
//   - Opening Tier (Dev2): src/features/opening-tier/types.ts
// ============================================================
export * from "@/shared/types";
export * from "@/features/dashboard/types";
export * from "@/features/opponent/types";
