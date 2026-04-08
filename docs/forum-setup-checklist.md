# 게시판(Forum) · OAuth · DB 설정 — 해야 할 일 전체 정리

이 문서는 **체스 게시판**, **NextAuth(Google·Discord)**, **PostgreSQL**, **(선택) Azure Blob 이미지 업로드**를 쓰기 위해 **직접 구성해야 하는 항목**을 순서대로 모았습니다.  
코드는 이미 저장소에 포함되어 있으며, 아래 **인프라·콘솔·환경 변수**는 운영자(본인)가 채워 넣어야 합니다.

---

## 0. 증상으로 원인 찾기

| 증상 | 의미 | 조치 방향 |
|------|------|-----------|
| `GET /api/v1/forum/posts` → **503** | DB 미연결 | 루트 `.env`에 `DATABASE_URL` 설정, 마이그레이션 실행 |
| `GET /api/backend-jwt` → **401** | 미로그인 | OAuth 로그인 완료 후 다시 시도 |
| `GET /api/v1/forum/...` → **401** (Bearer 필요한 API) | 토큰 없음/만료 | 로그인 상태 유지, `AUTH_SECRET`/`JWT_SECRET` 일치 확인 |
| 이미지 업로드 URL이 `/uploads/...` 로 저장됨 | Supabase/Azure 미설정으로 로컬 폴백 동작 | 운영에서는 Supabase Storage 또는 Azure Blob 설정 |

글 목록이 비어 있는 것은 **200 + 빈 배열**이지 503이 아닙니다.

---

## 1. PostgreSQL 준비

1. **로컬**: Docker로 Postgres 띄우거나, Homebrew/설치본 등으로 인스턴스를 만듭니다.  
2. **Azure**: [Azure Database for PostgreSQL - Flexible Server](https://learn.microsoft.com/azure/postgresql/flexible-server/) 등으로 서버·DB·사용자 생성.  
3. 방화벽에서 **백엔드가 접속할 IP**(로컬 IP, Azure Container Apps 아웃바운드 등)를 허용합니다.

**백엔드용 연결 문자열 형식 (async):**

```text
postgresql+asyncpg://USER:PASSWORD@HOST:5432/DBNAME?ssl=require
```

Azure Flexible Server는 보통 `ssl=require` 또는 `sslmode=require`가 필요합니다. 로컬 전용 Postgres는 `ssl` 없이도 될 수 있습니다.

---

## 2. DB 스키마 마이그레이션 (Alembic)

저장소 루트에 `DATABASE_URL`이 잡힌 상태에서:

```bash
cd backend
alembic -c alembic.ini upgrade head
```

- `DATABASE_URL_SYNC`를 비우면 Alembic이 `+asyncpg`를 제거한 **동기** URL로 마이그레이션합니다 (`psycopg2-binary` 사용).  
- 한 번만 성공하면 이후 배포 시에도 같은 명령(또는 CI 단계)으로 갱신합니다.

---

## 3. OAuth 앱 등록 (Google · Discord)

코드는 **환경 변수가 있을 때만** 해당 프로바이더를 켭니다. 콘솔에서 앱을 만들고 **리디렉트 URI**를 정확히 맞춰야 합니다.

### 3.1 Google Cloud

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 선택 또는 생성.  
2. **API 및 서비스** → **사용자 인증 정보** → **OAuth 2.0 클라이언트 ID** 만들기 (유형: 웹 애플리케이션).  
3. **승인된 리디렉션 URI**에 다음을 추가 (환경마다 모두 추가):

   | 환경 | URI 예시 |
   |------|----------|
   | 로컬 Next | `http://localhost:3000/api/auth/callback/google` |
   | Docker 프론트가 3000이면 동일 | 위와 같음 |
   | Vercel 프로덕션 | `https://<프로젝트>.vercel.app/api/auth/callback/google` |
   | 커스텀 도메인 | `https://yourdomain.com/api/auth/callback/google` |

4. **클라이언트 ID** → `AUTH_GOOGLE_ID`, **클라이언트 보안 비밀번호** → `AUTH_GOOGLE_SECRET`.

### 3.2 Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.  
2. **OAuth2** → **Redirects**에 추가:

   | 환경 | URI 예시 |
   |------|----------|
   | 로컬 | `http://localhost:3000/api/auth/callback/discord` |
   | Vercel | `https://<프로젝트>.vercel.app/api/auth/callback/discord` |
   | 커스텀 도메인 | `https://yourdomain.com/api/auth/callback/discord` |

3. **Client ID** → `AUTH_DISCORD_ID`, **Client Secret** → `AUTH_DISCORD_SECRET`.

### 3.3 공통 비밀 — `AUTH_SECRET`

- 터미널에서: `openssl rand -base64 32`  
- 생성한 값을 **`AUTH_SECRET`**(프론트)과 **`JWT_SECRET`**(백엔드)에 **동일하게** 넣습니다.  
- 없으면 Auth.js 세션(`/api/auth/session`)이 실패하고, API용 JWT(`/api/backend-jwt`)도 맞지 않습니다.

---

## 4. 환경 변수 정리

### 4.1 프로젝트 루트 `.env` (권장)

백엔드 [`config.py`](../backend/app/core/config.py)는 **프로젝트 루트**의 `.env`를 읽습니다.  
`docker-compose`는 루트 `.env`를 백엔드·프론트 컨테이너 모두에 넘깁니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | 게시판 필수 | `postgresql+asyncpg://...` |
| `JWT_SECRET` | 게시판 API 인증 필수 | **`AUTH_SECRET`과 동일** |
| `FORESIGHT_CORS_ORIGINS` | 배포 시 권장 | 예: `https://xxx.vercel.app,http://localhost:3000` |
| `SUPABASE_URL` | 선택 | Supabase Storage 사용 시 필수 |
| `SUPABASE_SERVICE_ROLE_KEY` | 선택 | Supabase Storage 업로드 권한 키 |
| `SUPABASE_STORAGE_BUCKET` | 선택 | 기본 `avatars` |
| `SUPABASE_STORAGE_PUBLIC_BASE_URL` | 선택 | 공개 URL 베이스 |
| `AZURE_STORAGE_CONNECTION_STRING` | 선택 | Azure Blob 업로드 사용 시 |
| `AZURE_STORAGE_CONTAINER` | 선택 | 기본 `forum-uploads` |
| `AZURE_STORAGE_PUBLIC_BASE_URL` | 선택 | 공개 URL 베이스 |
| `AUTH_SECRET` | 프론트(Auth.js) | Docker로 프론트 띄울 때 루트 `.env`에 두면 주입됨 |
| `AUTH_URL` | 배포 시 권장 | 예: `http://localhost:3000` / `https://xxx.vercel.app` |
| `AUTH_TRUST_HOST` | 권장 | `true` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google 로그인 시 | |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | Discord 로그인 시 | |
| `FORESIGHT_API_URL` 또는 `NEXT_PUBLIC_API_URL` | 프론트→API | 예: `http://localhost:8000/api/v1` |

전체 키 이름은 이 문서의 표와 섹션 예시를 기준으로 설정하세요.

### 4.2 `frontend/.env.local` (로컬에서 `npm run dev`만 쓸 때)

Next.js는 기본적으로 여기를 읽습니다. Docker를 쓰지 않고 프론트만 로컬로 띄우면 **여기에 Auth·API URL**을 넣는 것이 편합니다.

- `frontend/.env.local` 파일에 필요한 값을 직접 설정  
- `AUTH_SECRET`, `AUTH_URL`, OAuth 키, `FORESIGHT_API_URL` 등

### 4.3 Vercel (프로덕션 프론트)

프로젝트 → **Settings → Environment Variables**에 예를 들어:

- `FORESIGHT_API_URL` = `https://<Azure API FQDN>/api/v1`  
- `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST=true`  
- `AUTH_GOOGLE_*`, `AUTH_DISCORD_*`  
- (Preview도 쓰면 Preview 환경에 동일 또는 스테이징 URL)

변경 후 **Redeploy** 필수.

### 4.4 Azure Container Apps (API)

- `DATABASE_URL`, `JWT_SECRET` (**Vercel `AUTH_SECRET`과 동일**)  
- `FORESIGHT_CORS_ORIGINS` (Vercel origin 포함)  
- Blob 사용 시 스토리지 연결 문자열·컨테이너명  

자세한 흐름은 [azure-deployment.md](./azure-deployment.md)의 **§2.1 게시판**과 [scripts/azure-setup.sh](../scripts/azure-setup.sh) 마지막 안내를 참고하세요.

---

## 5. (선택) Azure Blob — 이미지 업로드

1. Storage Account 생성 → **컨테이너** 생성(예: `forum-uploads`).  
2. **익명 읽기(Blob)** 또는 SAS/ CDN 정책을 정합니다.  
3. API에 `AZURE_STORAGE_CONNECTION_STRING` 주입.  
4. 공개 URL을 고정하고 싶으면 `AZURE_STORAGE_PUBLIC_BASE_URL` 설정.  
5. API Docker 이미지에는 **`libmagic1`** 이 포함되어 있어야 `python-magic`이 동작합니다(루트 `Dockerfile`에 반영됨).

---

## 6. 실행 후 검증 체크리스트

- [ ] `https://.../health` 또는 `http://localhost:8000/health` → 200  
- [ ] `GET /api/v1/forum/posts?limit=20` → **200** (빈 목록이어도 됨). **503이면 `DATABASE_URL`·마이그레이션 확인**  
- [ ] 브라우저에서 **로그인** 후 `/api/backend-jwt` → **200 + token** (401이면 세션·OAuth·`AUTH_SECRET` 확인)  
- [ ] 게시판에서 글 작성·댓글·좋아요 동작  
- [ ] (Blob 설정 시) 이미지 업로드 후 본문에 `![](https://...)` 로 표시되는지  

---

## 7. 관련 파일 (참고만)

| 구분 | 경로 |
|------|------|
| Forum API | `backend/app/api/routes/forum.py` |
| DB 세션 / 503 조건 | `backend/app/api/deps.py`, `backend/app/db/session.py` |
| Auth 설정 | `frontend/src/auth.ts` |
| API JWT 발급 | `frontend/src/app/api/backend-jwt/route.ts` |
| 공통 시크릿 헬퍼 | `frontend/src/lib/authSecret.ts` |
| 마이그레이션 | `backend/alembic/` |

---

## 8. 한 줄 요약

1. **Postgres** 만들고 **`DATABASE_URL` + `alembic upgrade head`**.  
2. **`AUTH_SECRET` = `JWT_SECRET`** 로 맞추기.  
3. **Google / Discord** 개발자 콘솔에 **콜백 URL** 등록 후 ID/Secret을 env에 넣기.  
4. **CORS**에 프론트 origin 넣기.  
5. 이미지 업로드를 쓰면 **Azure Blob** 연결 문자열 추가.  

이 순서를 끝내면 503(미설정 DB)·401(미로그인) 없이 게시판을 쓸 수 있습니다.
