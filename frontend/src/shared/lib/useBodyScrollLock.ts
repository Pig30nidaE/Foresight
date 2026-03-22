import { useEffect } from "react";

/**
 * 동시에 여러 모달이 `useBodyScrollLock(true)`를 쓸 수 있어 참조 카운팅으로 한 번만 잠금/해제합니다.
 */
let bodyScrollLockCount = 0;
let savedScrollY = 0;
type SavedStyles = {
  htmlOverflow: string;
  htmlOverscroll: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverflow: string;
};
let savedStyles: SavedStyles | null = null;

let wheelListener: ((e: WheelEvent) => void) | null = null;

function applyDocumentScrollLock() {
  const html = document.documentElement;
  const body = document.body;
  savedScrollY = window.scrollY;
  savedStyles = {
    htmlOverflow: html.style.overflow,
    htmlOverscroll: html.style.overscrollBehavior,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyOverflow: body.style.overflow,
  };

  html.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";

  wheelListener = (e: WheelEvent) => {
    const t = e.target;
    if (t instanceof Element && t.closest("[data-modal-scroll='true']")) return;
    e.preventDefault();
  };
  document.addEventListener("wheel", wheelListener, { passive: false, capture: true });
}

function releaseDocumentScrollLock() {
  if (!savedStyles || !wheelListener) return;

  const html = document.documentElement;
  const body = document.body;
  const y = savedScrollY;

  html.style.overflow = savedStyles.htmlOverflow;
  html.style.overscrollBehavior = savedStyles.htmlOverscroll;
  body.style.position = savedStyles.bodyPosition;
  body.style.top = savedStyles.bodyTop;
  body.style.left = savedStyles.bodyLeft;
  body.style.right = savedStyles.bodyRight;
  body.style.width = savedStyles.bodyWidth;
  body.style.overflow = savedStyles.bodyOverflow;

  document.removeEventListener("wheel", wheelListener, { capture: true });
  wheelListener = null;
  savedStyles = null;
  window.scrollTo(0, y);
}

/**
 * 모달이 열려 있을 때 뒤 페이지(문서) 스크롤을 막습니다.
 *
 * - 데스크톱: 스크롤 루트가 보통 `<html>` 이라 `body`만 고정하면 배경이 그대로 움직일 수 있음 → `html`도 overflow 잠금.
 * - iOS Safari: `position: fixed` + 스크롤 위치 복원이 안정적.
 * - 휠: 스크롤 체이닝 방지. 모달 내부 스크롤은 `data-modal-scroll="true"` 영역에만 허용.
 */
export function useBodyScrollLock(lock: boolean): void {
  useEffect(() => {
    if (!lock || typeof document === "undefined") return;

    bodyScrollLockCount++;
    if (bodyScrollLockCount === 1) {
      applyDocumentScrollLock();
    }

    return () => {
      bodyScrollLockCount--;
      if (bodyScrollLockCount === 0) {
        releaseDocumentScrollLock();
      }
    };
  }, [lock]);
}
