#!/bin/bash
# API Docker 이미지를 ACR에 빌드·푸시한 뒤 Container App을 새 이미지로 갱신합니다.
#   az login 선행. Azure for Students 등에서 ACR Tasks가 막혀 있으면 이 스크립트(로컬 docker)를 사용하세요.
#
# 사용 예:
#   ./scripts/azure-rebuild-api.sh
#   AZ_DEPLOY_TARGET=preview ./scripts/azure-rebuild-api.sh   # 이미지 :preview, 태그 environment=preview, 앱 기본 foresight-api
#   AZ_IMAGE_TAG=latest ./scripts/azure-rebuild-api.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AZ_RG="${AZ_RG:-foresight-rg-sea}"
export AZ_ACR="${AZ_ACR:-foresightacr2720}"
export AZ_API_APP="${AZ_API_APP:-foresight-api}"
export IMAGE_API="${IMAGE_API:-foresight-api}"

if [[ -n "${AZ_IMAGE_TAG:-}" ]]; then
  TAG="$AZ_IMAGE_TAG"
elif [[ "${AZ_DEPLOY_TARGET:-}" == "preview" ]]; then
  TAG="preview"
else
  TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
  if [[ -z "$TAG" ]]; then
    TAG="manual-$(date +%Y%m%d%H%M%S)"
  fi
fi

FULL_IMAGE="$AZ_ACR.azurecr.io/$IMAGE_API:$TAG"

echo "=== Azure 로그인 확인 ==="
az account show >/dev/null 2>&1 || { echo "❌ az login 필요"; exit 1; }
echo "✓ RG=$AZ_RG  ACR=$AZ_ACR  App=$AZ_API_APP  Image=$FULL_IMAGE"
echo ""

echo "=== Docker build (linux/amd64) ==="
docker build --platform linux/amd64 \
  -t "$FULL_IMAGE" \
  -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT"
echo ""

echo "=== ACR login & push ==="
az acr login -n "$AZ_ACR"
docker push "$FULL_IMAGE"
echo ""

echo "=== Container App 이미지 갱신 ==="
UPDATE_ARGS=( -g "$AZ_RG" -n "$AZ_API_APP" --image "$FULL_IMAGE" --output none )
if [[ "${AZ_DEPLOY_TARGET:-}" == "preview" ]]; then
  UPDATE_ARGS+=( --tags environment=preview )
fi
az containerapp update "${UPDATE_ARGS[@]}"

echo ""
echo "✅ 완료: $AZ_API_APP → $FULL_IMAGE"
