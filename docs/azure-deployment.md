# 배포: Vercel(프론트) + Azure for Students(백엔드)

이 문서는 **프론트엔드는 Vercel 그대로**, **API(FastAPI + Stockfish)만 Azure**에 두는 구성을 기준으로 합니다.  
Azure for Students **연간 $100 크레딧**은 주로 이 API 컨테이너(ACR + Container Apps 등)에 사용하면 됩니다.

## 빠른 시작

```bash
# 1. Azure 로그인 (브라우저 열림)
az login

# 2. 프로젝트 루트에서 스크립트 실행
./scripts/azure-setup.sh
```

스크립트가 끝나면 출력된 `NEXT_PUBLIC_API_URL` 값을 Vercel에 설정하고 재배포하세요.

| 상황 | 예시 |
|------|------|
| Vercel URL이 다름 | `VERCEL_ORIGIN=https://my-app.vercel.app ./scripts/azure-setup.sh` |
| `RequestDisallowedByAzure` (리전 정책) | 새 RG로 **southeastasia** 등 허용 리전: `AZ_RG=foresight-rg-sea AZ_LOC=southeastasia ./scripts/azure-setup.sh` |
| `InvalidResourceGroupLocation` | 이미 있는 RG는 리전을 바꿀 수 없음. 스크립트는 **기존 RG의 리전을 자동 사용**합니다. 다른 리전에 쓰려면 다른 `AZ_RG`로 실행하거나 포털에서 기존 RG 삭제 후 진행. |

신규 RG만 만들 때 스크립트 기본 리전은 **southeastasia**.

## 아키텍처

```
브라우저 ──HTTPS──▶ Vercel (Next.js)
    │
    └── fetch/SSE ──HTTPS──▶ Azure Container Apps (또는 App Service) : FastAPI /api/v1
```

- 브라우저가 **직접** Azure API를 호출하므로 Vercel Serverless 시간 제한과 무관합니다.
- CORS: Azure API가 **Vercel 배포 origin**을 허용해야 합니다.

## 1. Vercel (프론트) — 환경 변수

[Vercel 대시보드](https://vercel.com) → 프로젝트 → **Settings → Environment Variables**

| 이름 | 값 | 환경 |
|------|-----|------|
| **`FORESIGHT_API_URL`** (권장) | `https://<FQDN>/api/v1` | **Production** (필수) |
| `NEXT_PUBLIC_API_URL` (대안) | 동일 | 위와 동일 |

**`FORESIGHT_API_URL`**: 서버(`app/layout`)가 빌드/SSR 시 읽어 클라이언트에 넘깁니다. `NEXT_PUBLIC_*` 가 클라이언트 번들에 안 박히는 Vercel/모노레포 설정에서도 API 주소가 잡히도록 한 값입니다. (공개 API 주소라 비밀이 아님.)

**설정 순서:**
1. `./scripts/azure-setup.sh` 출력 URL 사용
2. Vercel → Settings → Environment Variables  
   - Key: **`FORESIGHT_API_URL`**, Value: `https://<FQDN>/api/v1`, Environment: **Production**
3. **Redeploy**

### 배포 후에도 브라우저가 `localhost`로 요청할 때

1. **우선 `FORESIGHT_API_URL` 설정** 후 재배포. 여전히 안 되면 **`NEXT_PUBLIC_API_URL`** 도 같은 값으로 추가.
2. **이름 오타**: `NEXT_PUBLIC_API` 만 있거나 `NEXT_PUBLIC_API_BASE` 등이면 클라이언트 fallback이 localhost일 수 있음.
3. **`NEXT_PUBLIC_*`만 쓰는 경우**: `next build` 시점에 치환됩니다. 변수 추가/수정 후 **반드시 Redeploy** 하세요.
4. **환경 범위**: **Preview**에만 넣고 **Production** URL로 접속하면 Production 빌드에는 값이 없을 수 있습니다.

- 끝까지 **`/api/v1`** 포함 (코드가 이 경로를 베이스로 사용).
- **Preview** 배포에서도 같은 API를 쓰면 동일 변수를 Preview에 추가하거나, 스테이징용 Azure 앱 URL을 따로 둡니다.

로컬 개발은 프로젝트 루트 `.env.local` (또는 `frontend/.env.local`)에:

```bash
FORESIGHT_API_URL=http://localhost:8000/api/v1
# 또는 NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
# 로컬에서 Azure API만 쓸 때
# FORESIGHT_API_URL=https://<your-api-fqdn>/api/v1
```

## 2. Azure (백엔드만) — CORS

백엔드는 환경 변수 **`FORESIGHT_CORS_ORIGINS`** 로 허용 origin을 지정합니다 (콤마 구분, 공백 없음).

**반드시 넣어야 하는 값 (예시):**

- 프로덕션 Vercel URL: `https://your-project.vercel.app`
- 커스텀 도메인을 쓰면: `https://www.yourdomain.com`
- 로컬 개발: `http://localhost:3000`

한 줄 예:

```text
FORESIGHT_CORS_ORIGINS=https://foresight.vercel.app,http://localhost:3000
```

- **비우면** 코드 기본값으로 `localhost` + `https://foresight.vercel.app` 만 허용합니다.  
  프로젝트 URL이 다르면 **반드시** Azure에 위 변수를 설정하세요.  
  (설정: [`backend/app/core/config.py`](../backend/app/core/config.py))

Preview 배포(`*.vercel.app`)까지 허용하려면 해당 origin도 콤마로 추가합니다.

## 3. Azure 사전 준비

1. [Azure for Students](https://azure.microsoft.com/free/students/)
2. [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) — `az login`
3. 예산 알림 설정 권장 ($100 크레딧 관리)

**`MissingSubscriptionRegistration` (Microsoft.ContainerRegistry)**  
신규 구독은 ACR 네임스페이스가 아직 등록되지 않은 경우가 많습니다. `./scripts/azure-setup.sh` 는 ACR 생성 전에 공급자를 자동 등록합니다. 수동으로만 할 때:

```bash
az provider register --namespace Microsoft.ContainerRegistry --wait
```

## 4. 리소스 그룹 · ACR

```bash
export AZ_RG=foresight-rg
# Students 등: 일부 리전은 정책으로 차단됨 → 스크립트 기본은 southeastasia
export AZ_LOC=southeastasia
az group create -n "$AZ_RG" -l "$AZ_LOC"

export AZ_ACR=foresightacr$((RANDOM % 9000 + 1000))
az acr create -g "$AZ_RG" -n "$AZ_ACR" --sku Basic --admin-enabled true
az acr login -n "$AZ_ACR"
```

## 5. API 이미지 빌드 (저장소 루트 Dockerfile)

Railway와 동일하게 **리포지토리 루트**의 `Dockerfile`이 `backend/` 를 이미지에 넣습니다.

```bash
cd /path/to/Foresight
az acr build -r "$AZ_ACR" -t foresight-api:latest -f Dockerfile .
```

## 6. Container Apps — API만 생성

```bash
az extension add --name containerapp --upgrade 2>/dev/null || true
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait

export AZ_CA_ENV=foresight-cae
az containerapp env create -g "$AZ_RG" -n "$AZ_CA_ENV" -l "$AZ_LOC"

export AZ_API_APP=foresight-api
# 아래 YOUR_VERCEL_ORIGIN 을 실제 Vercel 프로덕션 origin 으로 바꿉니다.
az containerapp create \
  -g "$AZ_RG" -n "$AZ_API_APP" \
  --environment "$AZ_CA_ENV" \
  --image "$AZ_ACR.azurecr.io/foresight-api:latest" \
  --registry-server "$AZ_ACR.azurecr.io" \
  --target-port 8000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 2 \
  --cpu 1.0 --memory 2.0Gi \
  --env-vars \
    "FORESIGHT_CORS_ORIGINS=https://YOUR_VERCEL_ORIGIN,http://localhost:3000" \
    "LICHESS_API_TOKEN=" \
    "LICHESS_USER_AGENT=Foresight/1.0 (your-email-or-url)"
```

ACR pull (관리 ID 대신 관리자 계정으로 간단히):

```bash
ACR_USER=$(az acr credential show -n "$AZ_ACR" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$AZ_ACR" --query "passwords[0].value" -o tsv)
az containerapp registry set \
  -g "$AZ_RG" -n "$AZ_API_APP" \
  --server "$AZ_ACR.azurecr.io" \
  --username "$ACR_USER" \
  --password "$ACR_PASS"
```

API 주소:

```bash
az containerapp show -g "$AZ_RG" -n "$AZ_API_APP" \
  --query properties.configuration.ingress.fqdn -o tsv
```

이 FQDN으로 Vercel에 설정:

`NEXT_PUBLIC_API_URL=https://<FQDN>/api/v1`

## 7. 배포 후 체크리스트

1. 브라우저에서 `https://<FQDN>/health` (또는 `/docs`) 응답 확인  
2. Vercel `NEXT_PUBLIC_API_URL` 이 위와 일치하는지  
3. Azure `FORESIGHT_CORS_ORIGINS` 에 Vercel origin 이 포함되는지  
4. 브라우저 개발자 도구에서 API 요청이 CORS 에러 없이 나가는지  

게임 분석은 **SSE**를 사용합니다. 연결이 중간에 끊기면 Container Apps / 프록시 **타임아웃**을 확인하세요.

### 동시에 여러 명이 게임 분석할 때 (대기 큐)

1. **앱 내부 대기열(선택)**  
   `STOCKFISH_CONCURRENT` 가 **0(기본)** 이면 **유저끼리 서로 분석이 끝날 때까지 기다리지 않습니다** — 요청마다 즉시 Stockfish 분석이 시작됩니다.  
   **1 이상**으로 두면 레플리카 안에서 그 개수만큼만 병렬이고, 나머지는 세마포어에서 대기합니다 (초저사양 단일 인스턴스용).

2. **Azure가 사용자를 나누는 조건**  
   Container Apps **HTTP 스케일**로 레플리카가 늘어납니다. `azure-setup.sh` 기본은 **`STOCKFISH_CONCURRENT=0`**, **`AZ_HTTP_CONCURRENCY=1`**, **`max-replicas=10`** — 동시 SSE가 늘면 새 레플리카로 분산하기 쉽습니다.

3. **이미 만든 앱에 적용하려면** (환경 변수 + 스케일, 이미지 재빌드는 선택):

   ```bash
   az containerapp update -g "$AZ_RG" -n "$AZ_API_APP" \
     --set-env-vars "STOCKFISH_CONCURRENT=0" \
     --scale-rule-name http-scaler \
     --scale-rule-type http \
     --scale-rule-http-concurrency 1 \
     --min-replicas 0 \
     --max-replicas 10
   ```

4. **단일 소형 인스턴스만 쓸 때**  
   비용 때문에 레플리카를 1로 고정한다면 `STOCKFISH_CONCURRENT=1` 로 앱 레벨 대기열을 두는 편이 OOM/과부하에 안전할 수 있습니다.

스크립트: `AZ_MAX_REPLICAS=15 ./scripts/azure-setup.sh` 등으로 상한 조정.

## 8. Railway 제거

API를 Azure로만 쓰면 Railway 백엔드 연결을 끊어도 됩니다.  
[railway.toml](../railway.toml) 은 레거시로 두거나 삭제해도 됩니다.

## 9. GitHub Actions (API 이미지만)

[`.github/workflows/azure-containerapps.yml`](../.github/workflows/azure-containerapps.yml) — 푸시 시 자동이 아니라 **`workflow_dispatch`** 로 API 이미지 빌드·배포.  
프론트는 Vercel이 Git 연동으로 처리합니다.

## 10. 크레딧·비용 (학생 $100/년)

- **Container Apps** + **ACR Basic** + 로그(소량) 조합이 일반적입니다.
- `min-replicas 1` 이면 유휴 시에도 소액 과금될 수 있어, 트래픽이 없을 때 `min-replicas 0` 가능 여부는 [현재 Container Apps 요금/제한](https://azure.microsoft.com/pricing/details/container-apps/)을 확인하세요.
- Stockfish는 CPU를 많이 씁니다. 너무 낮은 CPU/메모리면 분석이 매우 느려집니다.

## 11. 관련 문서

- [analysis-scheduling-and-logic.md](./analysis-scheduling-and-logic.md) — SSE·Semaphore·캐시
- [`.env.example`](../.env.example) — 변수 이름 참고

**참고:** 프론트를 Azure에 올리는 방법은 이 문서 범위가 아닙니다. Vercel만 사용할 때는 `frontend/Dockerfile` / `output: standalone` 은 로컬 Docker 테스트용으로만 쓰면 됩니다.
