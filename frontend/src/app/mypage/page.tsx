"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import api from "@/shared/lib/api";
import { getBackendJwt } from "@/shared/lib/backendJwt";
import { useSettings, type Language, type Theme } from "@/shared/components/settings/SettingsContext";

type Me = {
  id: string;
  public_id: string;
  email: string | null;
  display_name: string;
  signup_completed: boolean;
  profile_public: boolean;
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      setMe(data);
      setDisplayName(data.display_name);
      setProfilePublic(Boolean(data.profile_public));
      setError(null);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      const msg = typeof d === "string" ? d : e?.message ?? "프로필 저장에 실패했습니다.";
      setError(msg);
    } finally {
      setBusy(false);
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
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">마이페이지</h1>
        <Link href="/forum" className="text-sm text-chess-accent hover:underline">
          게시판으로 이동
        </Link>
      </div>

      {loading && <p className="text-chess-muted">불러오는 중...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {me && !me.signup_completed && (
        <div className="rounded-lg border border-chess-border bg-chess-surface/50 p-4 text-sm text-chess-primary">
          <p>포럼 가입을 마치면 닉네임 수정·글 목록을 이용할 수 있습니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/signup/consent"
              className="rounded-md bg-chess-accent px-3 py-2 text-sm font-semibold text-white"
            >
              가입 동의
            </Link>
            <Link href="/signup" className="rounded-md border border-chess-border px-3 py-2 text-sm">
              닉네임 입력
            </Link>
          </div>
        </div>
      )}

      {me && me.signup_completed && (
        <>
          <form onSubmit={onSaveSettings} className="space-y-3 rounded-lg border border-chess-border p-4">
            <h2 className="text-lg font-semibold">앱 설정</h2>
            <p className="text-xs text-chess-muted">이 설정은 사용자 계정별로 브라우저에 저장됩니다.</p>
            <div>
              <label className="block text-sm font-medium text-chess-primary">언어</label>
              <select
                className="mt-1 w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm"
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
                className="mt-1 w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm"
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
                className="mt-1 w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm"
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
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white"
              >
                설정 저장
              </button>
              {settingsSaved && <span className="text-xs text-emerald-600">저장되었습니다.</span>}
            </div>
          </form>

          <form onSubmit={onSaveProfile} className="space-y-3 rounded-lg border border-chess-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">프로필 설정</h2>
              {me.profile_public && me.public_id && (
                <Link
                  href={`/user/${me.public_id}`}
                  className="text-sm font-medium text-chess-accent hover:underline"
                >
                  공개 프로필 보기
                </Link>
              )}
            </div>
            <p className="text-xs text-chess-muted">이메일: {me.email ?? "-"}</p>
            <div>
              <label className="block text-sm font-medium text-chess-primary">닉네임</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-md border border-chess-border bg-chess-bg px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-chess-primary">
              <input
                type="checkbox"
                checked={profilePublic}
                onChange={(e) => setProfilePublic(e.target.checked)}
              />
              프로필 공개 (끄면 타인이 내 글/댓글 목록을 볼 수 없음)
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-chess-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "저장 중..." : "저장"}
            </button>
          </form>

          <section className="rounded-lg border border-chess-border p-4">
            <h2 className="text-lg font-semibold">내가 쓴 글</h2>
            <div className="mt-3 space-y-2">
              {posts.length === 0 ? (
                <p className="text-sm text-chess-muted">작성한 글이 없습니다.</p>
              ) : (
                posts.map((p) => (
                  <article key={p.id} className="rounded-md border border-chess-border p-3">
                    <Link href={`/forum/${p.public_id ?? p.id}`} className="font-semibold hover:text-chess-accent">
                      {p.title}
                    </Link>
                    <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm text-chess-muted [overflow-wrap:anywhere]">
                      {p.body_preview}
                    </p>
                    <p className="mt-1 text-xs text-chess-muted">{new Date(p.created_at).toLocaleString()}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-chess-border p-4">
            <h2 className="text-lg font-semibold">내가 쓴 댓글</h2>
            <div className="mt-3 space-y-2">
              {comments.length === 0 ? (
                <p className="text-sm text-chess-muted">작성한 댓글이 없습니다.</p>
              ) : (
                comments.map((c) => (
                  <article key={c.id} className="rounded-md border border-chess-border p-3">
                    <Link
                      href={`/forum/${c.post_public_id ?? c.post_id}`}
                      className="text-sm font-semibold hover:text-chess-accent"
                    >
                      {c.post_title}
                    </Link>
                    <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm text-chess-primary [overflow-wrap:anywhere]">
                      {c.body}
                    </p>
                    <p className="mt-1 text-xs text-chess-muted">{new Date(c.created_at).toLocaleString()}</p>
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
