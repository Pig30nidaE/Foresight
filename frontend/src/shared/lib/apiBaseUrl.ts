/**
 * 백엔드 API 베이스 URL (`.../api/v1`, 끝 슬래시 없음).
 *
 * - 브라우저 번들: `NEXT_PUBLIC_*` 만 빌드 시 치환됨 → 누락 시 localhost fallback.
 * - 서버(루트 layout): `FORESIGHT_API_URL` 은 빌드/런타임에 서버에서 읽혀 클라이언트로 전달되므로
 *   Vercel에서 NEXT_PUBLIC 이 클라이언트에 안 박히는 경우에도 동작하게 할 수 있음.
 */
export function resolveApiBaseUrl(): string {
  const raw =
    process.env.FORESIGHT_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API ||
    "http://localhost:8000/api/v1";
  return raw.replace(/\/+$/, "");
}
