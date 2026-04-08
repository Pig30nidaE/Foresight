"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { uploadForumImage } from "@/features/community/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { useTranslation } from "@/shared/lib/i18n";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

type Props = {
  onUploaded: (url: string) => void;
  onError?: (msg: string) => void;
  className?: string;
  label?: string;
};

export default function ForumImageUploadButton({ onUploaded, onError, className, label }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > MAX_SIZE) {
      onError?.(t("forum.image.tooLarge"));
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      onError?.(t("forum.image.unsupportedType"));
      return;
    }
    setUploading(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error("No token");
      const res = await uploadForumImage(token, file);
      onUploaded(res.url);
    } catch {
      onError?.(t("forum.image.uploadFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={
          className ??
          "font-pixel pixel-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs bg-chess-surface/70 text-chess-primary hover:bg-chess-elevated/60 disabled:opacity-50"
        }
      >
        {uploading ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("forum.image.uploading")}
          </>
        ) : (
          <>
            <ImagePlus className="size-3.5" aria-hidden />
            {label ?? t("forum.image.upload")}
          </>
        )}
      </button>
    </>
  );
}
