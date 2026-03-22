#!/bin/bash
# Azure + Vercel 배포 세팅
# 1. 먼저 터미널에서: az login
# 2. 프로젝트 루트에서 실행: ./scripts/azure-setup.sh
#
# ※ ACR Tasks (az acr build) 는 Azure for Students 에서 막혀 있으므로
#    로컬 docker build → docker push 방식을 사용합니다.

set -e

# ── 변수 (필요 시 환경 변수로 override) ──
export AZ_RG="${AZ_RG:-foresight-rg-sea}"
# RG가 이미 존재하면 그 리전을 자동 사용. 없으면 AZ_LOC 로 생성.
export AZ_LOC="${AZ_LOC:-southeastasia}"
export AZ_CA_ENV="${AZ_CA_ENV:-foresight-cae}"
export AZ_API_APP="${AZ_API_APP:-foresight-api}"
export AZ_ACR="${AZ_ACR:-foresightacr2720}"
# Vercel 프로덕션 URL (CORS). 변경 시: VERCEL_ORIGIN=https://my-app.vercel.app ./scripts/azure-setup.sh
export VERCEL_ORIGIN="${VERCEL_ORIGIN:-https://foresight.vercel.app}"
# 동시 게임 분석(SSE) 분산: 레플리카당 동시 HTTP가 이 값을 넘기 전 스케일아웃 (낮을수록 더 빨리 인스턴스 추가)
export AZ_HTTP_CONCURRENCY="${AZ_HTTP_CONCURRENCY:-2}"
# 최대 레플리카 수 (비용 상한). 예: AZ_MAX_REPLICAS=15 ./scripts/azure-setup.sh
export AZ_MAX_REPLICAS="${AZ_MAX_REPLICAS:-10}"

echo "=== Azure 로그인 확인 ==="
az account show >/dev/null 2>&1 || { echo "❌ az login 필요"; exit 1; }
echo "✓ 로그인됨: $(az account show --query name -o tsv)"
echo "ACR: $AZ_ACR.azurecr.io"
echo ""

echo "=== 1. 리소스 그룹 ==="
DESIRED_LOC=$(echo "$AZ_LOC" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
if az group show -n "$AZ_RG" &>/dev/null; then
  AZ_LOC=$(az group show -n "$AZ_RG" --query location -o tsv | tr '[:upper:]' '[:lower:]' | tr -d ' ')
  echo "기존 그룹 사용: $AZ_RG (리전: $AZ_LOC)"
else
  AZ_LOC="$DESIRED_LOC"
  az group create -n "$AZ_RG" -l "$AZ_LOC" --output none
  echo "✓ 그룹 생성: $AZ_RG ($AZ_LOC)"
fi
echo ""

echo "=== 2. 리소스 공급자 등록 (신규 구독) ==="
for ns in Microsoft.ContainerRegistry Microsoft.App Microsoft.OperationalInsights; do
  STATE=$(az provider show -n "$ns" --query registrationState -o tsv 2>/dev/null || echo "NotRegistered")
  if [[ "$STATE" != "Registered" ]]; then
    echo "  → $ns 등록 중..."
    az provider register --namespace "$ns" --wait
  else
    echo "  ✓ $ns (이미 등록됨)"
  fi
done
echo ""

echo "=== 3. ACR 생성 (없으면) ==="
if az acr show -n "$AZ_ACR" &>/dev/null; then
  echo "기존 ACR 사용: $AZ_ACR.azurecr.io"
else
  az acr create -g "$AZ_RG" -n "$AZ_ACR" --sku Basic --admin-enabled true --output none
  echo "✓ ACR 생성: $AZ_ACR.azurecr.io"
fi
echo ""

echo "=== 4. Docker 이미지 로컬 빌드 (linux/amd64) ==="
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker build --platform linux/amd64 \
  -t "$AZ_ACR.azurecr.io/foresight-api:latest" \
  -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT"
echo "✓ 빌드 완료"
echo ""

echo "=== 5. ACR 로그인 및 Push ==="
az acr login -n "$AZ_ACR"
docker push "$AZ_ACR.azurecr.io/foresight-api:latest"
echo "✓ Push 완료"
echo ""

echo "=== 6. Container Apps 확장 ==="
az extension add --name containerapp --upgrade 2>/dev/null || true
echo ""

echo "=== 7. Container Apps 환경 (없으면 생성) ==="
if az containerapp env show -g "$AZ_RG" -n "$AZ_CA_ENV" &>/dev/null; then
  echo "기존 환경 사용: $AZ_CA_ENV"
else
  az containerapp env create -g "$AZ_RG" -n "$AZ_CA_ENV" -l "$AZ_LOC" --output none
  echo "✓ 환경 생성: $AZ_CA_ENV"
fi
echo ""

ACR_USER=$(az acr credential show -n "$AZ_ACR" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$AZ_ACR" --query "passwords[0].value" -o tsv)

echo "=== 8. Container App 생성 또는 이미지 업데이트 ==="
if az containerapp show -g "$AZ_RG" -n "$AZ_API_APP" &>/dev/null; then
  echo "기존 앱 이미지 업데이트: $AZ_API_APP"
  az containerapp update \
    -g "$AZ_RG" -n "$AZ_API_APP" \
    --image "$AZ_ACR.azurecr.io/foresight-api:latest" \
    --output none
else
  echo "앱 생성 중: $AZ_API_APP"
  # Stockfish 리소스: 1 CPU 컨테이너 기준
  #   STOCKFISH_THREADS=1  → CPU 초과 방지
  #   STOCKFISH_HASH_MB=128 → 메모리 절약
  #   STOCKFISH_CONCURRENT=1 → 레플리카당 동시 분석 1개 (여러 사용자는 HTTP 스케일로 레플리카 증설)
  az containerapp create \
    -g "$AZ_RG" -n "$AZ_API_APP" \
    --environment "$AZ_CA_ENV" \
    --image "$AZ_ACR.azurecr.io/foresight-api:latest" \
    --registry-server "$AZ_ACR.azurecr.io" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --target-port 8000 \
    --ingress external \
  --min-replicas 0 \
  --max-replicas "$AZ_MAX_REPLICAS" \
  --cpu 1.0 --memory 2.0Gi \
    --env-vars \
      "FORESIGHT_CORS_ORIGINS=${VERCEL_ORIGIN},http://localhost:3000" \
      "LICHESS_API_TOKEN=" \
      "LICHESS_USER_AGENT=Foresight/1.0" \
      "STOCKFISH_THREADS=1" \
      "STOCKFISH_HASH_MB=128" \
      "STOCKFISH_CONCURRENT=1" \
    --output none
fi
echo "✓ $AZ_API_APP"
echo ""

echo "=== 9. HTTP 스케일링 규칙 적용 ==="
# min-replicas=0: 유휴 시 비용 $0 (Scale to Zero)
# http-concurrency: 레플리카당 동시 HTTP 요청(SSE 포함)이 이 값을 넘기 전에 스케일아웃
#   기본 2 → 3번째 동시 사용자부터 새 레플리카로 분산하기 쉬움 (기존 3은 한 대에 몰림)
# max-replicas: AZ_MAX_REPLICAS 로 덮어쓰기 가능 (기본 10)
# → 비용은 트래픽에 비례. 기존 앱은 아래 update 만으로도 규칙 갱신됨.
az containerapp update \
  -g "$AZ_RG" -n "$AZ_API_APP" \
  --scale-rule-name http-scaler \
  --scale-rule-type http \
  --scale-rule-http-concurrency "$AZ_HTTP_CONCURRENCY" \
  --min-replicas 0 \
  --max-replicas "$AZ_MAX_REPLICAS" \
  --output none
echo "✓ 스케일링 규칙 적용 (min=0, http-concurrency=$AZ_HTTP_CONCURRENCY, max=$AZ_MAX_REPLICAS)"
echo ""

FQDN=$(az containerapp show -g "$AZ_RG" -n "$AZ_API_APP" \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "=============================================="
echo "✅ Azure API 배포 완료"
echo "=============================================="
echo ""
echo "API 주소:  https://${FQDN}"
echo "Health:    https://${FQDN}/health"
echo "Docs:      https://${FQDN}/docs"
echo ""
echo "▶ Vercel에 설정할 환경 변수 (권장):"
echo "  FORESIGHT_API_URL=https://${FQDN}/api/v1"
echo "  (대안) NEXT_PUBLIC_API_URL=https://${FQDN}/api/v1"
echo ""
echo "Vercel 대시보드 → 프로젝트 → Settings → Environment Variables"
echo "  Key: FORESIGHT_API_URL"
echo "  Value: https://${FQDN}/api/v1"
echo "  Environment: Production"
echo "설정 후 Redeploy (Deployments → ··· → Redeploy) 하세요."
echo ""
