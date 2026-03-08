import { useState, useEffect, useRef } from "react";

/**
 * 로딩 상태를 시뮬레이션 퍼센트(0~100)로 변환하는 훅.
 *
 * - isLoading=true  → 0% 에서 시작해 로그 곡선으로 ~88% 까지 서서히 증가
 * - isLoading=false → 100% 로 스냅, 650ms 후 0으로 리셋 (바 사라짐)
 */
export function useLoadingProgress(isLoading: boolean): number {
  const [pct, setPct] = useState(0);
  const curRef   = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => {
    // 이전 타이머 정리
    if (timerRef.current) clearInterval(timerRef.current);
    if (resetRef.current) clearTimeout(resetRef.current);

    if (isLoading) {
      curRef.current = 0;
      setPct(0);
      timerRef.current = setInterval(() => {
        const remaining = 88 - curRef.current;
        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        // 로그 곡선: 남은 거리의 6%, 최소 0.4씩 증가 → 처음엔 빠르고 끝으로 갈수록 느림
        const inc = Math.max(0.4, remaining * 0.06);
        curRef.current = Math.min(88, curRef.current + inc);
        setPct(Math.round(curRef.current));
      }, 250);
    } else {
      // 로딩 완료 → 100% 스냅 후 650ms 뒤 바 제거
      if (curRef.current > 0) {
        setPct(100);
        resetRef.current = setTimeout(() => {
          curRef.current = 0;
          setPct(0);
        }, 650);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLoading]);

  return pct;
}
