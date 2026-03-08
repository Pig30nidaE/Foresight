/**
 * lib/api.ts — 하위 호환 배럴 파일
 * ─────────────────────────────────────────────
 * 기존 코드에서 @/lib/api 로 import 시 계속 동작합니다.
 * 새 기능의 API 함수는 features/<feature>/api.ts 에 추가하세요.
 *   - Dashboard: src/features/dashboard/api.ts  (Dev1)
 *   - Opening Tier: src/features/opening-tier/api.ts  (Dev2)
 */
export * from "@/shared/lib/api";          // getPlayerProfile, getRecentGames, etc.
export * from "@/features/dashboard/api";  // 대시보드 분석 API

import api from "@/shared/lib/api";
export default api;
