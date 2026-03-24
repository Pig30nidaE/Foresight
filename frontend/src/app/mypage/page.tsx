"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { useSettings, type Language, type Theme } from "@/shared/components/settings/SettingsContext";
import AvatarThumb from "@/shared/components/ui/AvatarThumb";
import { useTranslation } from "@/shared/lib/i18n";

type Me = {
  id: string;
  public_id: string;
  email: string | null;
  display_name: string;
  signup_completed: boolean;
  profile_public: boolean;
  avatar_url?: string | null;
};

type MyPost = {
  id: string;
  public_id: string;
  title: string;
  body_preview: string;
  created_at: string;
};

type MyComment = {
  id: string;
  body: string;
  created_at: string;
  post_id: string;
  post_public_id: string;
  post_title: string;
};

export default function MyPage() {
  const router = useRouter();
  const { status } = useSession();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [profilePublic, setProfilePublic] = useState(true);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [comments, setComments] = useState<MyComment[]>([]);
  const { language, setLanguage, theme, setTheme, stockfishDepth, setStockfishDepth } = useSettings();
  const [draftLang, setDraftLang] = useState<Language>(language);
  const [draftTheme, setDraftTheme] = useState<Theme>(theme);
  const [draftDepth, setDraftDepth] = useState<number>(stockfishDepth);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const syncMe = (data: Me) => {
    setMe(data);
    setDisplayName(data.display_name);
    setProfilePublic(Boolean(data.profile_public));
  };

  const load = async () => {
    if (status === "unauthenticated") {
      router.replace("/api/auth/signin?callbackUrl=%2Fpost-login");
      return;
    }
    if (status === "loading") return;
    try {
      setLoading(true);
      const token = await getBackendJwt();
      if (!token) throw new Error("로그인 토큰이 없습니다.");
      const meRes = await api.get<Me>("/forum/me", { headers: { Authorization: `Bearer ${token}` } });
      setMe(meRes.data);
      setDisplayName(meRes.data.display_name);
      setProfilePublic(Boolean(meRes.data.profile_public));
      setError(null);

      if (!meRes.data.signup_completed) {
        setPosts([]);
        setComments([]);
        return;
      }

      const [postsRes, commentsRes] = await Promise.all([
        api.get<{ items: MyPost[] }>("/forum/me/posts", { headers: { Authorization: `Bearer ${token}` } }),
        api.get<{ items: MyComment[] }>("/forum/me/comments", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setPosts(postsRes.data.items ?? []);
      setComments(commentsRes.data.items ?? []);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg =
        typeof d === "string" ? d : Array.isArray(d) ? d.map((x: unknown) => JSON.stringify(x)).join(" ") : e?.message;
      setError(msg ?? "마이페이지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  useEffect(() => {
    setDraftLang(language);
  }, [language]);
  useEffect(() => {
    setDraftTheme(theme);
  }, [theme]);
  useEffect(() => {
    setDraftDepth(stockfishDepth);
  }, [stockfishDepth]);

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error("로그인 토큰이 없습니다.");
      const { data } = await api.patch<Me>(
        "/forum/me/profile",
        { display_name: displayName, profile_public: profilePublic },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      syncMe(data);
      setError(null);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg = typeof d === "string" ? d : e?.message ?? "프로필 저장에 실패했습니다.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const patchProfileFields = async (body: Record<string, unknown>) => {
    const token = await getBackendJwt();
    if (!token) throw new Error("로그인 토큰이 없습니다.");
    const { data } = await api.patch<Me>("/forum/me/profile", body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    syncMe(data);
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("이미지는 5MB 이하로 올려 주세요.");
      return;
    }
    setAvatarBusy(true);
    setError(null);
    try {
      const token = await getBackendJwt();
      if (!token) throw new Error("로그인 토큰이 없습니다.");
      const fd = new FormData();
      fd.append("file", f);
      const { data: up } = await api.post<{ url: string }>("/forum/upload", fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await patchProfileFields({ avatar_url: up.url });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? "이미지 업로드에 실패했습니다.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const onDefaultAvatar = async () => {
    setAvatarBusy(true);
    setError(null);
    try {
      await patchProfileFields({ use_site_default_avatar: true });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? "프로필 사진을 바꾸지 못했습니다.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRestoreOAuthAvatar = async () => {
    setAvatarBusy(true);
    setError(null);
    try {
      await patchProfileFields({ restore_oauth_avatar: true });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : err?.message ?? "계정 사진을 적용하지 못했습니다.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const onSaveSettings = (e: FormEvent) => {
    e.preventDefault();
    setLanguage(draftLang);
    setTheme(draftTheme);
    setStockfishDepth(draftDepth);
    setSettingsSaved(true);
    window.setTimeout(() => setSettingsSaved(false), 1500);
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-pixel text-2xl md:text-3xl font-bold tracking-wide text-chess-primary pixel-glitch-title">
          마이페이지
        </h1>
        <Link
          href="/forum"
          className="font-pixel inline-flex items-center px-3 py-1.5 text-xs font-medium text-chess-primary pixel-btn bg-chess-surface/80 hover:brightness-[1.03] dark:bg-chess-elevated/50"
        >
          게시판으로 이동
        </Link>
      </div>

      {loading && (
        <p className="font-pixel text-sm text-chess-muted border-2 border-chess-border border-dashed px-3 py-2 w-fit">
          불러오는 중...
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 pixel-frame pixel-hud-fill px-3 py-2 border-red-500/40">
          {error}
        </p>
      )}

      {me && !me.signup_completed && (
        <div className="pixel-frame pixel-hud-fill p-4 text-sm text-chess-primary">
          <p>포럼 가입을 마치면 닉네임 수정·글 목록을 이용할 수 있습니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/signup/consent"
              className="font-pixel inline-flex items-center px-3 py-2 text-xs font-semibold text-white bg-chess-accent pixel-btn"
            >
              가입 동의
            </Link>
            <Link
              href="/signup"
              className="font-pixel inline-flex items-center px-3 py-2 text-xs font-medium text-chess-primary pixel-btn bg-chess-surface/80"
            >
              닉네임 입력
            </Link>
          </div>
        </div>
      )}

      {me && me.signup_completed && (
        <>
          <form onSubmit={onSaveSettings} className="space-y-3 pixel-frame pixel-hud-fill p-4 sm:p-5">
            <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">앱 설정</h2>
            <p className="text-xs text-chess-muted">이 설정은 사용자 계정별로 브라우저에 저장됩니다.</p>
            <div>
              <label className="block text-sm font-medium text-chess-primary">언어</label>
              <select
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
                value={draftLang}
                onChange={(e) => setDraftLang(e.target.value as Language)}
              >
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-chess-primary">테마</label>
              <select
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
                value={draftTheme}
                onChange={(e) => setDraftTheme(e.target.value as Theme)}
              >
                <option value="light">라이트</option>
                <option value="dark">다크</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-chess-primary">Stockfish Depth</label>
              <select
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
                value={draftDepth}
                onChange={(e) => setDraftDepth(Number(e.target.value))}
              >
                {[12, 18, 24].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="font-pixel px-4 py-2 text-xs font-semibold text-white bg-chess-accent pixel-btn"
              >
                설정 저장
              </button>
              {settingsSaved && (
                <span className="font-pixel text-[11px] text-chess-win tabular-nums">저장되었습니다.</span>
              )}
            </div>
          </form>

          <form onSubmit={onSaveProfile} className="space-y-3 pixel-frame pixel-hud-fill p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">프로필 설정</h2>
              {me.profile_public && me.public_id && (
                <Link
                  href={`/profile/${me.public_id}`}
                  className="font-pixel text-[11px] font-medium text-chess-accent underline decoration-2 underline-offset-2 hover:brightness-110"
                >
                  공개 프로필 보기
                </Link>
              )}
            </div>
            <p className="text-xs text-chess-muted">이메일: {me.email ?? "-"}</p>

            <div>
              <p className="text-sm font-medium text-chess-primary">{t("profile.photo")}</p>
              <div className="mt-2 flex flex-wrap items-start gap-4">
                <AvatarThumb src={me.avatar_url} alt="" size={64} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs leading-relaxed text-chess-muted">{t("profile.photoHint")}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={onAvatarFile}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={avatarBusy || busy}
                      onClick={() => fileInputRef.current?.click()}
                      className="font-pixel px-3 py-1.5 text-[11px] font-semibold text-chess-primary pixel-btn bg-chess-surface/80 disabled:opacity-50"
                    >
                      {t("profile.chooseImage")}
                    </button>
                    <button
                      type="button"
                      disabled={avatarBusy || busy}
                      onClick={() => void onDefaultAvatar()}
                      className="font-pixel px-3 py-1.5 text-[11px] font-medium text-chess-primary pixel-btn bg-chess-border/25 disabled:opacity-50"
                    >
                      {t("profile.useDefaultImage")}
                    </button>
                    <button
                      type="button"
                      disabled={avatarBusy || busy}
                      onClick={() => void onRestoreOAuthAvatar()}
                      className="font-pixel px-3 py-1.5 text-[11px] font-medium text-chess-primary pixel-btn bg-chess-border/25 disabled:opacity-50"
                    >
                      {t("profile.restoreOAuthPhoto")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-chess-primary">닉네임</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm text-chess-primary pixel-input"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-chess-primary">
              <input
                type="checkbox"
                checked={profilePublic}
                onChange={(e) => setProfilePublic(e.target.checked)}
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-chess-accent border-chess-border"
              />
              <span>프로필 공개 (끄면 타인이 내 글/댓글 목록을 볼 수 없음)</span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="font-pixel px-4 py-2 text-xs font-semibold text-white bg-chess-accent pixel-btn disabled:opacity-50"
            >
              {busy ? "저장 중..." : "저장"}
            </button>
          </form>

          <section className="pixel-frame pixel-hud-fill p-4 sm:p-5">
            <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">내가 쓴 글</h2>
            <div className="mt-3 space-y-2">
              {posts.length === 0 ? (
                <p className="text-sm text-chess-muted border-2 border-dashed border-chess-border/70 px-3 py-6 text-center">
                  작성한 글이 없습니다.
                </p>
              ) : (
                posts.map((p) => (
                  <article key={p.id} className="pixel-frame pixel-hud-fill p-3">
                    <Link
                      href={`/forum/${p.public_id ?? p.id}`}
                      className="font-pixel text-sm font-bold text-chess-primary hover:text-chess-accent [overflow-wrap:anywhere]"
                    >
                      {p.title}
                    </Link>
                    <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm text-chess-muted [overflow-wrap:anywhere]">
                      {p.body_preview}
                    </p>
                    <p className="mt-1 font-pixel text-[10px] tabular-nums text-chess-muted">
                      {new Date(p.created_at).toLocaleString()}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="pixel-frame pixel-hud-fill p-4 sm:p-5">
            <h2 className="font-pixel text-lg font-bold text-chess-primary tracking-wide">내가 쓴 댓글</h2>
            <div className="mt-3 space-y-2">
              {comments.length === 0 ? (
                <p className="text-sm text-chess-muted border-2 border-dashed border-chess-border/70 px-3 py-6 text-center">
                  작성한 댓글이 없습니다.
                </p>
              ) : (
                comments.map((c) => (
                  <article key={c.id} className="pixel-frame pixel-hud-fill p-3">
                    <Link
                      href={`/forum/${c.post_public_id ?? c.post_id}`}
                      className="font-pixel text-xs font-bold text-chess-accent hover:brightness-110 [overflow-wrap:anywhere]"
                    >
                      {c.post_title}
                    </Link>
                    <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm text-chess-primary [overflow-wrap:anywhere]">
                      {c.body}
                    </p>
                    <p className="mt-1 font-pixel text-[10px] tabular-nums text-chess-muted">
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
