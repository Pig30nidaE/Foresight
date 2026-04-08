# Foresight

체스 분석 + 커뮤니티 기능을 제공하는 풀스택 프로젝트입니다.

- Frontend: Next.js (App Router), TypeScript
- Backend: FastAPI, SQLAlchemy, Alembic
- Infra(로컬): Docker Compose + Makefile

## 빠른 시작 (권장)

1. 환경 변수 준비

```bash
cp .env.template .env
```

1. 개발 스택 실행

```bash
make up
```

1. 로그 확인

```bash
make logs
```

1. 접속

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:8000>
- Health: <http://localhost:8000/health>

## Windows / Make 미사용 환경

아래 커맨드로 동일하게 실행할 수 있습니다.

```bash
docker compose up -d --build
docker compose logs -f
```

중지는 아래 명령을 사용합니다.

```bash
docker compose down
```

## 자주 쓰는 명령

```bash
make help
make up
make down
make restart
make logs
make logs-backend
make logs-frontend
make db-migrate
make clean
```

## 프로젝트 구조 (요약)

- `frontend/src/app`: 라우트 엔트리
- `frontend/src/features`: 기능별 UI/도메인 모듈
- `frontend/src/shared`: 공통 컴포넌트/유틸
- `backend/app/api/routes`: API 라우트
- `backend/app/features`: 백엔드 기능 모듈
- `backend/app/shared`: 공통 백엔드 유틸/서비스
- `docs`: 운영/분석/보안 문서

## 라우트 호환성 정책

리팩토링 중에도 기존 링크 호환성을 유지합니다.

- 공개 프로필 canonical 경로: `/user/[userId]`
- 별칭 경로 유지: `/profile/[userId]`
- 게시글 상세는 board/forum 별칭을 모두 허용

## 보안 관련 환경 변수

보호 계정(관리자 강제 role/display name) 정책은 환경 변수로 제어합니다.

- `FORUM_PROTECTED_ADMIN_EMAIL`
- `FORUM_PROTECTED_ADMIN_DISPLAY_NAME`

운영 환경에서는 기본값을 그대로 사용하지 말고 반드시 실제 운영 값으로 설정하세요.

## 테스트

백엔드 핵심 회귀(호환/보안) 테스트:

```bash
PYTHONPATH=$PWD/backend /opt/homebrew/bin/python3.11 -m pytest \
	backend/tests/test_profile_pagination.py \
	backend/tests/test_security_and_guards.py \
	backend/test_forum_protected_admin_content.py \
	backend/test_forum_signup_security.py \
	backend/tests/test_route_compatibility.py
```

프론트 정적 검사:

```bash
cd frontend && npm run lint
```

## 가드레일

- import 경계 규칙(`no-restricted-imports`) 적용:
	- `features`/`shared` -> `@/app/*` 직접 import 금지
	- forum 도메인 유틸은 `@/features/forum/lib/*` 경유 사용
- 규칙 위치: `frontend/eslint.config.mjs`

## 참고 문서

- `docs/analysis-scheduling-and-logic.md`
- `docs/azure-deployment.md`
- `docs/forum-setup-checklist.md`
- `docs/security-production-checklist.md`
