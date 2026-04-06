# Frontend Module Notes

Foresight 프론트엔드(Next.js App Router) 하위 모듈 문서입니다.

## 실행

```bash
npm install
npm run dev
```

기본 접속 주소: <http://localhost:3000>

## 레이어 가이드

- `src/app`: 라우트 엔트리(페이지/레이아웃), thin wrapper 우선
- `src/features`: 도메인 기능 모듈
- `src/shared`: 공통 UI/유틸/타입

## 리팩토링 경계 규칙

- `features`/`shared`에서 `@/app/*` 직접 import 금지
- forum 도메인 유틸은 `@/features/forum/lib/*` 경유 사용

위 규칙은 ESLint 설정([frontend/eslint.config.mjs](eslint.config.mjs))으로 관리합니다.

## 참고

저장소 전체 실행/구성/보안/테스트 가이드는 루트 문서 [README.md](../README.md)를 기준으로 합니다.
