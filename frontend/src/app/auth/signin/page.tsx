"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { useTranslation } from "@/shared/lib/i18n";

type Provider = {
  id: string;
  name: string;
  type: string;
  signinUrl: string;
  callbackUrl: string;
  icon?: string;
};

function getProviderIcon(providerId: string): React.ReactNode {
  switch (providerId) {
    case "google":
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      );
    case "discord":
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.607 1.25a18.27 18.27 0 00-5.487 0c-.163-.386-.395-.875-.607-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 00-.042-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.294.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.011c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.076.076 0 00-.041.107c.36.698.77 1.363 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-4.718-.838-8.812-3.549-12.456a.06.06 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-.965-2.157-2.156 0-1.193.973-2.157 2.157-2.157 1.193 0 2.156.964 2.156 2.157 0 1.19-.964 2.156-2.156 2.156zm7.975 0c-1.183 0-2.157-.965-2.157-2.156 0-1.193.973-2.157 2.157-2.157 1.193 0 2.157.964 2.157 2.157 0 1.19-.964 2.156-2.157 2.156z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function SignInPage() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const callbackUrl = searchParams.get("callbackUrl") || "/post-login";
  const errorParam = searchParams.get("error");

  useEffect(() => {
    // NextAuth 프로바이더 엔드포인트에서 사용 가능한 프로바이더를 가져옵니다
    const fetchProviders = async () => {
      try {
        const res = await fetch("/api/auth/providers");
        if (!res.ok) throw new Error("Failed to fetch providers");
        const data = await res.json();
        
        const providersMap: Record<string, Provider> = {};
        for (const [key, provider] of Object.entries(data)) {
          if (provider && typeof provider === 'object' && 'id' in provider && 'name' in provider) {
            const p = provider as any;
            providersMap[p.id] = {
              id: p.id,
              name: p.name,
              type: p.type || 'oauth',
              signinUrl: `/api/auth/signin/${p.id}?callbackUrl=${encodeURIComponent(callbackUrl)}`,
              callbackUrl,
            };
          }
        }
        setProviders(providersMap);
      } catch (err) {
        console.error("Failed to fetch providers:", err);
        setError(t("signin.error.fetchProviders") || "Failed to load login providers");
      } finally {
        setLoading(false);
      }
    };

    void fetchProviders();
  }, [callbackUrl, t]);

  useEffect(() => {
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        Callback: t("auth.error.callback") || "Authentication callback error",
        OAuthSignin: t("auth.error.oauthSignin") || "OAuth signin error",
        OAuthCallback: t("auth.error.oauthCallback") || "OAuth callback error",
        EmailCreateAccount: t("auth.error.emailCreateAccount") || "Could not create email account",
        Default: t("auth.error.default") || "Unknown error",
      };
      setError(errorMessages[errorParam] || errorMessages["Default"]);
    }
  }, [errorParam, t]);

  const handleSignIn = async (providerId: string) => {
    setSigningIn(providerId);
    try {
      await signIn(providerId, { callbackUrl, redirect: true });
    } catch (err) {
      setSigningIn(null);
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-chess-background to-chess-surface/50 px-4">
      <div className="w-full max-w-md">
        {/* 상단 로고 및 제목 */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-chess-primary mb-2">
            Foresight
          </h1>
          <p className="text-chess-muted text-sm">
            {t("auth.subtitle") || "Chess Game Analysis & Opening Theory"}
          </p>
        </div>

        {/* 메인 카드 */}
        <div className="pixel-frame border-2 border-chess-border bg-chess-surface p-8 rounded-lg shadow-xl">
          <h2 className="text-2xl font-bold text-chess-primary mb-2 text-center">
            {t("signin.title") || "Sign In"}
          </h2>
          <p className="text-center text-chess-muted mb-6 text-sm">
            {t("signin.desc") || "Log in with your preferred OAuth provider"}
          </p>

          {/* 에러 메시지 */}
          {error && (
            <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-200">
                {error}
              </p>
            </div>
          )}

          {/* OAuth 버튼들 */}
          <div className="space-y-3">
            {Object.entries(providers).length === 0 && !loading && (
              <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-200">
                  {t("signin.error.noProviders") || "No authentication providers available"}
                </p>
              </div>
            )}
            
            {loading ? (
              <>
                <div className="h-12 rounded-lg border-2 border-chess-border bg-chess-surface/30 animate-pulse" />
                <div className="h-12 rounded-lg border-2 border-chess-border bg-chess-surface/30 animate-pulse" />
              </>
            ) : (
              Object.entries(providers).map(([key, provider]) => (
                <button
                  key={key}
                  onClick={() => handleSignIn(provider.id)}
                  disabled={signingIn === provider.id}
                  className={`w-full flex items-center justify-center gap-3 rounded-lg border-2 border-chess-border bg-chess-surface/50 px-4 py-3 font-semibold transition-all duration-200 hover:bg-chess-surface hover:border-chess-primary/50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    signingIn === provider.id
                      ? "border-chess-primary bg-chess-primary/10"
                      : ""
                  }`}
                >
                  <span className="text-chess-primary">
                    {getProviderIcon(provider.id)}
                  </span>
                  <span className="text-chess-text">
                    {signingIn === provider.id
                      ? t("signin.signingIn") || "Signing in..."
                      : `${t("signin.signInWith") || "Sign in with"} ${provider.name}`}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* 약관 및 정책 */}
          <div className="mt-6 border-t border-chess-border/50 pt-4">
            <p className="text-center text-xs text-chess-muted">
              By signing in, you agree to our{" "}
              <Link href="/terms" className="text-chess-primary hover:underline">
                Terms of Service
              </Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-chess-primary hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>

        {/* 하단 정보 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-chess-muted">
            {t("signin.noAccount") || "New to Foresight?"}{" "}
            <span className="text-chess-primary">
              {t("signin.signUpPrompt") || "Your account will be created during OAuth"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
