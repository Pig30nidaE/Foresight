import type { Platform, TimeClass } from "@/shared/types";

const DEFAULT_PLATFORM: Platform = "chess.com";
const DEFAULT_TIME_CLASS: TimeClass = "blitz";

function parsePlatform(value: string | null | undefined): Platform {
  if (value === "lichess") return "lichess";
  return DEFAULT_PLATFORM;
}

function parseTimeClass(value: string | null | undefined): TimeClass {
  if (value === "bullet" || value === "blitz" || value === "rapid" || value === "classical") {
    return value;
  }
  return DEFAULT_TIME_CLASS;
}

export interface BuildGameAnalysisHrefOptions {
  gameId: string;
  platform?: Platform;
  username?: string;
  timeClass?: TimeClass;
  autoStart?: boolean;
}

export function buildGameAnalysisHref({
  gameId,
  platform,
  username,
  timeClass,
  autoStart,
}: BuildGameAnalysisHrefOptions): string {
  const params = new URLSearchParams();
  params.set("gameId", gameId);
  if (platform) params.set("platform", platform);
  if (username) params.set("username", username);
  if (timeClass) params.set("timeClass", timeClass);
  if (autoStart) params.set("autostart", "1");
  return `/game-analysis?${params.toString()}`;
}

export function buildGameAnalysisHrefFromDashboard(
  dashboardHref: string | null | undefined,
  gameId: string,
): string {
  if (!dashboardHref) return buildGameAnalysisHref({ gameId });

  try {
    const parsed = new URL(dashboardHref, "https://foresight.local");
    return buildGameAnalysisHref({
      gameId,
      platform: parsePlatform(parsed.searchParams.get("platform")),
      username: parsed.searchParams.get("username") ?? undefined,
      timeClass: parseTimeClass(parsed.searchParams.get("timeClass")),
    });
  } catch {
    return buildGameAnalysisHref({ gameId });
  }
}
