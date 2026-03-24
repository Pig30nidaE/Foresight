"use client";

import { resolveAvatarUrl } from "@/shared/lib/avatarUrl";

type Props = {
  src: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
  /** 포럼·네비용: 픽셀 프레임 느낌의 테두리·짧은 그림자 */
  variant?: "plain" | "hud";
};

export default function AvatarThumb({
  src,
  alt,
  size = 22,
  className = "",
  variant = "plain",
}: Props) {
  const frame =
    variant === "hud"
      ? "border-2 border-chess-border bg-chess-surface shadow-[2px_2px_0_color-mix(in_srgb,var(--color-chess-primary)_14%,transparent)] dark:shadow-[2px_2px_0_rgba(0,0,0,0.5)]"
      : "border border-chess-border bg-chess-surface";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolveAvatarUrl(src)}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 object-cover rounded-[var(--pixel-radius)] ${frame} ${className}`}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      referrerPolicy="no-referrer"
    />
  );
}
