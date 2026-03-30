/**
 * 기본 프로필 이미지. 실제 파일은 항상 저장소의
 * `frontend/public/images/based_profile.png` (배포 시 공개 URL `/images/based_profile.png`).
 */
export const DEFAULT_AVATAR_PATH = "/images/based_profile.png";

export function resolveAvatarUrl(url: string | null | undefined): string {
  const u = url?.trim();
  if (u) return u;
  return DEFAULT_AVATAR_PATH;
}
