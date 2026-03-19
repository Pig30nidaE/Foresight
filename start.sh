#!/usr/bin/env bash
# Legacy wrapper: prefer `make up` (cross-platform Docker workflow).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v make >/dev/null 2>&1; then
  echo "[ERROR] make command not found."
  echo "Use Docker Compose directly: docker compose up -d --build"
  exit 1
fi

make up
make logs
