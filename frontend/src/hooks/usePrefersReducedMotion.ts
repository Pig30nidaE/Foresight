"use client";

/* matchMedia 구독 전 초기값 동기화에 setState가 필요 (하이드레이션 정합) */
/* eslint-disable react-hooks/set-state-in-effect -- 표준 prefers-reduced-motion 훅 패턴 */
import { useState, useLayoutEffect } from "react";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** SSR/첫 페인트용 — `usePrefersReducedMotion` 과 동일한 기준 */
export function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOTION_QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readPrefersReducedMotion);
  useLayoutEffect(() => {
    const mq = window.matchMedia(MOTION_QUERY);
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
