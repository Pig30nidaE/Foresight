/** Normalize FastAPI `detail` (string | validation array | object) for UI. */
export function apiErrorDetail(err: unknown): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg ?? "");
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(", ");
  }
  if (d && typeof d === "object" && "message" in d) {
    return String((d as { message: string }).message);
  }
  if (err instanceof Error) return err.message;
  return "요청 처리 중 오류가 발생했습니다.";
}
