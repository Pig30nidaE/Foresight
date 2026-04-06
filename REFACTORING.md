### 실행 계획 (작은 PR 단위, 완전 호환 유지)

1. PR-1 Baseline 고정
- 현재 URL/API/응답 shape 회귀 기준을 테스트로 고정합니다.
- 대상: forum/board/profile 핵심 시나리오.

2. PR-2 Community 모듈 스켈레톤 생성 (Forum/Board)
- 신규 구조 시작점: features/community/forum, features/community/board.
- app 라우트는 thin wrapper로 전환 준비.

3. PR-3 Profile 모듈 스켈레톤 생성
- self/public profile 공통 타입/활동목록 인터페이스를 먼저 정리합니다.

4. PR-4 Forum/Board 목록 페이지 분할 (PR-2 의존)
- 중복 로직(정렬/검색/페이지네이션/권한확인) 훅 추출.
- board 특화 로직(kind, pinned notice)만 board 계층 유지.
- 대상: page.tsx, page.tsx

5. PR-5 Forum/Board 상세 페이지 분할 (PR-2, PR-4 의존)
- 상세 페이지 과책임(댓글/좋아요/신고/수정/체스편집)을 컨테이너+하위 모듈로 분해.
- board 상세 alias는 제거하지 않고 호환 wrapper로 유지.
- 대상: [frontend/src/app/forum/[postId]/page.tsx](frontend/src/app/forum/%5BpostId%5D/page.tsx), [frontend/src/app/board/[postId]/page.tsx](frontend/src/app/board/%5BpostId%5D/page.tsx)

6. PR-6 Profile 페이지 분할 (PR-3 의존)
- mypage에서 프로필편집/아바타/설정/활동탭 분리.
- public profile과 활동 리스트/페이지네이션 재사용 컴포넌트화.
- 대상: page.tsx, PublicUserProfileView.tsx

7. PR-7 API/Type 계층 정규화 (PR-4, PR-6 의존)
- raw axios 호출을 feature API 함수 경유로 통일.
- shared primitive type vs feature domain type 분리.
- 대상: api.ts, api.ts, index.ts, index.ts

8. PR-8 Backend profile 책임 분리 (PR-1 의존)
- forum.py 내부 profile 책임을 profile 전용 계층으로 이동.
- 외부 경로는 그대로 유지하여 호환성 보장.
- 대상: forum.py, profile.py, main.py

9. PR-9 Backend community 서비스 추출 (PR-8 의존)
- 게시글/상호작용 로직을 서비스 레이어로 추출.
- 라우트는 auth + request/response 변환만 담당.

10. PR-10 테스트 보강 및 회귀망 완성 (PR-4, PR-6, PR-8, PR-9 의존)
- URL/API 호환, 권한, 페이지네이션, board/forum 분기, profile visibility 고정.
- 기존 테스트 기반 확장: test_profile_pagination.py, test_forum_protected_admin_content.py, test_security_and_guards.py, test_forum_signup_security.py

11. PR-11 정리 및 재오염 방지 가드레일
- 빈 feature 폴더 정리.
- import 경계 룰(no-restricted-imports) 추가.
- app 레이어는 route wrapper만 남기도록 정리.

---

### 포함/제외 범위
1. 포함
- forum/board 프론트 통합
- profile 프론트 분리
- backend forum/profile 책임 분리
- 타입/API 계층 통합
- 테스트 구조 보강

2. 제외
- 신규 비즈니스 기능 추가
- 대규모 UX 재디자인 (경미한 UX 개선만 허용)

---

### 검증 계획
1. Backend 테스트
- python -m pytest test_profile_pagination.py test_forum_protected_admin_content.py test_security_and_guards.py test_forum_signup_security.py

2. Frontend 정적 검증
- cd frontend && npm run lint

3. 수동 회귀
- forum 목록/상세/작성/댓글/좋아요
- board kind 탭/공지 pinned/상세 진입
- mypage 수정/아바타/public profile 비공개 가시성
- 기존 링크 호환: /board/[postId], /profile/[userId]

---

세션 플랜 파일에도 동기화해 두었습니다: /memories/session/plan.md

원하시면 다음 응답부터 PR-1 단위로 바로 실행 가능한 작업 순서(파일 단위 변경 리스트 + 테스트 순서)로 쪼개서 진행하겠습니다.