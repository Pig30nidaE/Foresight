import { useState, useEffect, useRef } from "react";

/**
 * 로딩 상태 + 실제 타깃 퍼센트를 UI 진행률(0~100)로 변환하는 훅.
 * - isLoading=true  -> targetPercent(또는 0)까지 부드럽게 추적
 * - isLoading=false -> 100으로 스냅 후 650ms 뒤 0으로 리셋
 */
export function useLoadingProgress(isLoading: boolean, targetPercent?: number): number {
  const [pct, setPct] = useState(0);
  const curRef   = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout>  | null>(null);

  const clamp = (value: number) => Math.max(0, Math.min(100, value));

  useEffect(() => {
    // 이전 타이머 정리
    if (timerRef.current) clearInterval(timerRef.current);
    if (resetRef.current) clearTimeout(resetRef.current);

    if (isLoading) {
      const target = clamp(targetPercent ?? 0);

      if (curRef.current === 0) {
        curRef.current = target;
        setPct(Math.round(curRef.current));
      }

      timerRef.current = setInterval(() => {
        const remaining = target - curRef.current;
        if (Math.abs(remaining) < 0.3) {
          curRef.current = target;
          setPct(Math.round(curRef.current));
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }

        // 타깃과의 차이를 빠르게 좁히되, 작은 값도 끊기지 않게 보정
        const step = Math.sign(remaining) * Math.max(0.5, Math.abs(remaining) * 0.3);
        curRef.current = clamp(curRef.current + step);
        setPct(Math.round(curRef.current));
      }, 120);
    } else {
      const finalTarget = clamp(targetPercent ?? 100);

      if (curRef.current <= 0) {
        curRef.current = 0;
        setPct(0);
        return () => {
          if (timerRef.current) clearInterval(timerRef.current);
        };
      }

      // 실제 완료 시에만 100% 스냅 후 바 제거
      if (finalTarget >= 100 && curRef.current > 0) {
        curRef.current = 100;
        setPct(100);
        resetRef.current = setTimeout(() => {
          curRef.current = 0;
          setPct(0);
        }, 650);
      } else {
        curRef.current = 0;
        setPct(0);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLoading, targetPercent]);

  return pct;
}
