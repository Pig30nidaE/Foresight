#!/usr/bin/env bash
# ── Foresight Dev Server ──────────────────────────────────────────────────────
# backend  : FastAPI  @ http://localhost:8000
# frontend : Next.js  @ http://localhost:3000
# 종료: Ctrl+C (양쪽 프로세스 모두 정리됨)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 색상 ────────────────────────────────────────────────────────────────────
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[0;33m"
RESET="\033[0m"

echo -e "${BOLD}${GREEN}▶ Foresight 개발 서버 시작${RESET}"
echo -e "${CYAN}  Backend  →  http://localhost:8000${RESET}"
echo -e "${CYAN}  Frontend →  http://localhost:3000${RESET}"
echo ""

# ── 종료 시 자식 프로세스 정리 ───────────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}⏹  서버를 종료합니다...${RESET}"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo -e "${YELLOW}✔  종료 완료${RESET}"
}
trap cleanup INT TERM

# ── Backend (FastAPI) ────────────────────────────────────────────────────────
echo -e "${BOLD}[backend]${RESET} uvicorn 시작..."
(
  cd "$ROOT/backend"
  source .venv/bin/activate
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 2>&1 | sed "s/^/$(printf '\033[0;36m')[backend]$(printf '\033[0m') /"
) &
BACKEND_PID=$!

# ── Frontend (Next.js) ───────────────────────────────────────────────────────
echo -e "${BOLD}[frontend]${RESET} Next.js 시작..."
(
  cd "$ROOT/frontend"
  npm run dev 2>&1 | sed "s/^/$(printf '\033[0;32m')[frontend]$(printf '\033[0m') /"
) &
FRONTEND_PID=$!

# ── 두 프로세스 종료될 때까지 대기 ──────────────────────────────────────────
wait "$BACKEND_PID" "$FRONTEND_PID"
