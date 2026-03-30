/**
 * JRPG window corner brackets — decorative only, pointer-events none.
 */
export default function PixelHudPanelChrome() {
  const arm = "pointer-events-none absolute z-[1] border-chess-accent";
  return (
    <>
      <span className={`${arm} left-1 top-1 h-3 w-3 border-l-[3px] border-t-[3px]`} aria-hidden />
      <span className={`${arm} right-1 top-1 h-3 w-3 border-r-[3px] border-t-[3px]`} aria-hidden />
      <span className={`${arm} bottom-1 left-1 h-3 w-3 border-b-[3px] border-l-[3px]`} aria-hidden />
      <span className={`${arm} bottom-1 right-1 h-3 w-3 border-b-[3px] border-r-[3px]`} aria-hidden />
    </>
  );
}
