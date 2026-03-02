# Foresight — 협업 가이드라인

> **AI 및 개발자가 이 문서를 먼저 읽고 작업하세요.**  
> 체스 대회 참가자를 위한 AI 기반 대국 분석 플랫폼입니다.  
> 잘못된 수정이 Stockfish 평가 정확도 또는 사용자 데이터 무결성에 직접 영향을 줍니다.

---

## 목차

1. [프로젝트 구조 개요](#1-프로젝트-구조-개요)
2. [개발 환경 설정](#2-개발-환경-설정)
3. [Git Commit Convention](#3-git-commit-convention)
4. [Branch 전략](#4-branch-전략)
5. [Backend 코드 컨벤션](#5-backend-코드-컨벤션)
6. [Frontend 코드 컨벤션](#6-frontend-코드-컨벤션)
7. [절대 수정 금지 구역](#7-절대-수정-금지-구역)
8. [수정 시 반드시 주의할 구역](#8-수정-시-반드시-주의할-구역)
9. [API 설계 규칙](#9-api-설계-규칙)
10. [환경변수 관리](#10-환경변수-관리)
11. [테스트 정책](#11-테스트-정책)

---

## 1. 프로젝트 구조 개요

```
Foresight/
├── backend/                    # FastAPI 서버 (Python 3.11)
│   └── app/
│       ├── api/routes/         # HTTP 엔드포인트 (5개 라우터)
│       ├── core/               # 설정 (config.py)
│       ├── ml/                 # Stockfish 엔진 래퍼 + 수 분류기
│       ├── models/             # Pydantic 스키마
│       └── services/           # 비즈니스 로직 레이어
└── frontend/                   # Next.js 16 (App Router, TypeScript)
    └── src/
        ├── app/                # 페이지 라우트
        ├── components/         # 재사용 UI 컴포넌트
        ├── lib/api.ts          # Axios 기반 API 클라이언트 (단일 진실)
        └── types/index.ts      # 공용 TypeScript 타입 (단일 진실)
```

### 데이터 흐름

```
External APIs (Chess.com / Lichess)
  → backend/services/chessdotcom.py | lichess.py  (게임 수집)
  → backend/services/pgn_parser.py               (PGN 파싱)
  → backend/ml/engine.py                         (Stockfish 분석)
  → backend/ml/move_classifier.py                (수 품질 분류)
  → backend/services/tactical_analysis.py        (20가지 패턴)
  → backend/services/ai_insights.py              (GPT-4o-mini 코치)
  → frontend/lib/api.ts                          (API 클라이언트)
  → frontend/components/charts/                  (시각화)
```

---

## 2. 개발 환경 설정

### 필수 설치

- Python 3.11
- Node.js 20
- **Stockfish 18** — `brew install stockfish` (macOS) / 시스템 PATH 등록 필수
- Docker Desktop (선택)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

### 환경변수 (.env — 루트에 위치)

```.env
OPENAI_API_KEY=sk-...
LICHESS_API_TOKEN=lip_...
```

`OPENAI_API_KEY` 가 없으면 AI 인사이트는 자동으로 규칙 기반 폴백으로 동작합니다 (서버는 정상 실행됨).

---

## 3. Git Commit Convention

**Conventional Commits** 스펙을 따릅니다.

### 형식

```
<type>(<scope>): <subject>

[body - 선택]

[footer - 선택]
```

### Type 목록

| Type | 설명 | 예시 |
|------|------|------|
| `feat` | 새 기능 추가 | `feat(analysis): 블런더 타임라인 API 추가` |
| `fix` | 버그 수정 | `fix(engine): 메이트 점수 센티폰 변환 오류 수정` |
| `refactor` | 기능 변경 없는 코드 개선 | `refactor(tactical): SF 분석 대상 게임 수 파라미터화` |
| `perf` | 성능 개선 | `perf(engine): SF_DEPTH 10→8 blitz 분석 속도 개선` |
| `style` | 포맷/공백 등 비기능 변경 | `style(frontend): Tailwind 클래스 정렬` |
| `test` | 테스트 추가/수정 | `test(opening): ECO 캐시 로드 통합 테스트 추가` |
| `docs` | 문서 수정 | `docs: CONTRIBUTING.md 업데이트` |
| `chore` | 빌드/의존성/설정 변경 | `chore: requirements.txt xgboost 추가` |
| `ci` | CI/CD 파이프라인 변경 | `ci: GitHub Actions 빌드 스크립트 추가` |

### Scope 목록

| Scope | 대상 |
|-------|------|
| `engine` | `backend/app/ml/engine.py` — Stockfish 래퍼 |
| `classifier` | `backend/app/ml/move_classifier.py` |
| `tactical` | `backend/app/services/tactical_analysis.py` |
| `analysis` | `backend/app/services/analysis.py` |
| `pgn` | `backend/app/services/pgn_parser.py` |
| `opening` | `backend/app/services/opening_db.py` |
| `ai` | `backend/app/services/ai_insights.py` |
| `api` | `backend/app/api/routes/` |
| `schema` | `backend/app/models/schemas.py` |
| `config` | `backend/app/core/config.py` |
| `dashboard` | `frontend/src/app/dashboard/` |
| `charts` | `frontend/src/components/charts/` |
| `types` | `frontend/src/types/index.ts` |
| `api-client` | `frontend/src/lib/api.ts` |
| `deps` | 의존성 패키지 |

### 규칙

- `subject`는 **한국어 또는 영어**, 명령형 동사로 시작 (과거형 금지)
- 제목 70자 이하
- `BREAKING CHANGE:` 가 있는 경우 반드시 footer에 명시
- `feat` / `fix` / `BREAKING CHANGE` 는 **CHANGELOG에 자동 반영** 대상

### 예시

```
feat(tactical): MVP.md 전술 패턴 20종 전체 구현

- 시간/심리 패턴 6종 (Time Trouble, Tilt 등)
- 전술 모티프 5종 (Pin, Fork, Discovered Attack 등)
- 포지션/기물 패턴 5종 (IQP, Bishop Pair 등)
- 복잡도/전환 패턴 4종 (King Hunt 등)

BREAKING CHANGE: TacticalAnalysis 응답 스키마 변경
  strengths/weaknesses 필드가 배열→객체 구조로 변경됨
```

---

## 4. Branch 전략

```
main            ── 배포 브랜치 (직접 push 금지)
  └─ develop    ── 통합 브랜치
       ├─ feat/tactical-patterns
       ├─ feat/rating-trend-chart
       ├─ fix/engine-mate-score
       └─ refactor/pgn-clock-parser
```

- `main` → PR은 반드시 `develop` 경유
- 브랜치명: `<type>/<kebab-case-description>`
- 개인 작업 브랜치는 `develop`에서 분기

---

## 5. Backend 코드 컨벤션

### 언어 및 포맷

- **Python 3.11**, PEP 8 준수
- 들여쓰기: **4 spaces** (탭 금지)
- 최대 줄 길이: **120자**
- 모든 public 함수/클래스에 **docstring 필수**

### 네이밍

```python
# 변수, 함수: snake_case
def analyze_game_sync(pgn_str: str, username: str) -> List[MoveEval]:

# 클래스: PascalCase
class AnalysisService:

# 상수: UPPER_SNAKE_CASE
SF_DEPTH = 8
BLUNDER_CP = 150
MATE_SCORE = 10_000

# private 함수/변수: 언더스코어 prefix
def _parse_clock(comment: str) -> Optional[float]:
_RE_CLK = re.compile(r"\[%clk\s+...")
```

### 타입 힌팅

- **모든** 함수 매개변수 및 반환값에 타입 힌트 필수
- `Optional[X]` 대신 `X | None` (Python 3.10+) 사용 가능하나 프로젝트 내 일관성 유지 (현재 `Optional` 사용 중)

```python
# Good
def get_performance_summary(
    self,
    username: str,
    platform: Platform,
    games: List[GameSummary],
    time_class: str = "blitz",
) -> PerformanceSummary:

# Bad — 타입 힌트 없음
def get_performance_summary(self, username, platform, games):
```

### 비동기 패턴

- FastAPI 라우터 함수는 `async def`
- **Stockfish 분석(`analyze_game_sync`)은 동기 함수** — 반드시 `run_in_executor` 로 호출

```python
# 올바른 사용
import asyncio
loop = asyncio.get_event_loop()
result = await loop.run_in_executor(None, analyze_game_sync, pgn, username)

# 잘못된 사용 — async 라우터에서 직접 호출 금지
result = analyze_game_sync(pgn, username)  # ❌ 이벤트 루프 블로킹
```

### 서비스 레이어 구조

```python
# 라우터: 얇게, 서비스 호출만
@router.get("/...")
async def endpoint(platform: Platform, username: str):
    try:
        games = await svc.get_recent_games(username)
        return analysis_svc.process(games)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 비즈니스 로직은 services/ 또는 ml/ 에
```

### Pydantic 스키마 규칙

- `app/models/schemas.py` 에만 정의 (라우터 파일 내 인라인 정의 금지)
- `Optional` 필드는 반드시 `= None` 기본값 지정
- Enum은 `str, Enum` 다중 상속으로 직렬화 보장

```python
class Platform(str, Enum):
    chessdotcom = "chess.com"
    lichess = "lichess"
```

### 로깅

```python
import logging
logger = logging.getLogger(__name__)

logger.info("[Startup] Opening DB 준비 완료 — %d개 ECO 코드", count)
logger.warning("[AI Insights] OpenAI 호출 실패 (%s) → 규칙 기반 폴백", exc)
```

- `print()` 사용 금지 — 반드시 `logger` 사용
- 로그 메시지에 `[모듈명]` prefix 권장

---

## 6. Frontend 코드 컨벤션

### 언어 및 포맷

- **TypeScript strict mode** (`tsconfig.json`)
- 들여쓰기: **2 spaces**
- 컴포넌트 파일: `.tsx`, 유틸/훅 파일: `.ts`

### 네이밍

```typescript
// 컴포넌트: PascalCase
export default function MoveQualityDonut({ ... }: Props) {}

// 파일명: 컴포넌트는 PascalCase, 유틸/훅은 camelCase
// MoveQualityDonut.tsx  /  api.ts  /  useGameData.ts

// 변수/함수: camelCase
const handleSearch = (e: React.FormEvent) => {};
const sinceMs = useMemo(() => { ... }, [period]);

// 타입/인터페이스: PascalCase
interface MoveQualityStats { ... }
type Platform = "chess.com" | "lichess";

// 상수: UPPER_SNAKE_CASE (모듈 레벨)
const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];
```

### 컴포넌트 패턴

```tsx
// Props 인터페이스는 파일 상단에 명시 (인라인 타입 금지)
interface Props {
  username: string;
  platform: Platform;
  timeClass: TimeClass;
}

// 컴포넌트 본문
export default function ChartComponent({ username, platform, timeClass }: Props) {
  // 1. hooks
  // 2. derived state (useMemo)
  // 3. handlers
  // 4. early returns (loading/error)
  // 5. JSX
}
```

### 타입 관리 규칙

- **모든 공용 타입은 `src/types/index.ts` 에만 정의**
- 백엔드 `schemas.py` 와 프론트엔드 `types/index.ts` 는 **필드명·타입이 1:1 대응**되어야 함
  - `snake_case` 필드명을 그대로 유지 (camelCase 변환 금지 — axios가 변환하지 않음)
- 컴포넌트 파일 내부 로컬 타입만 인라인 허용

### API 호출 규칙

- **모든 API 호출은 `src/lib/api.ts` 를 통해서만** — 컴포넌트에서 axios 직접 호출 금지
- React Query 키는 배열 형태로 일관성 유지:

```typescript
// Good
useQuery({
  queryKey: ["tactical", platform, username, timeClass],
  queryFn: () => getTacticalPatterns(platform, username, timeClass),
  enabled: !!username,
});

// Bad
useQuery({ queryKey: "tactical", ... });  // ❌ 문자열 단일 키
```

### Tailwind CSS 규칙

- **다크 테마 유지**: `bg-zinc-950`, `text-zinc-100` 기반 팔레트 사용
- 새 색상 추가 시 기존 팔레트(`zinc`, `emerald`, `amber`, `red`) 우선 활용
- `className`이 길어질 경우 `clsx()`로 분리

```tsx
// Good
className={clsx(
  "rounded-xl border p-4",
  isActive ? "border-emerald-500" : "border-zinc-800",
)}

// Bad — 조건부 className 문자열 템플릿
className={`rounded-xl border p-4 ${isActive ? "border-emerald-500" : "border-zinc-800"}`}
```

### 수 품질 색상 동기화

`move_classifier.py`의 `CATEGORY_META` 색상과 `MoveQualityDonut.tsx`의 색상이 **반드시 동기화**되어야 합니다.

```python
# backend/app/ml/move_classifier.py
CATEGORY_META = {
    "Best":       {"color": "#10b981"},
    "Excellent":  {"color": "#34d399"},
    "Good":       {"color": "#6ee7b7"},
    "Inaccuracy": {"color": "#f59e0b"},
    "Mistake":    {"color": "#f97316"},
    "Blunder":    {"color": "#ef4444"},
}
```

색상을 변경하면 반드시 **백엔드와 프론트엔드를 동시에** 수정하세요.

---

## 7. 절대 수정 금지 구역

아래 코드는 체스 분석의 수학적 정확성과 외부 API 호환성에 직결됩니다. **기능 변경/삭제 절대 금지.**

### 7-1. 센티폰 → 승률 변환 공식

**파일**: `backend/app/ml/engine.py` — `_cp_to_win_pct()`

```python
def _cp_to_win_pct(cp: Optional[int]) -> float:
    """센티폰 → 승률(0~100). Chess.com 공식과 동일."""
    if cp is None:
        return 50.0
    capped = max(-MATE_SCORE, min(MATE_SCORE, cp))
    return 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * capped)) - 1.0)
```

> 이 공식은 Chess.com 공개 알고리즘과 동일합니다. 계수 `0.00368208` 을 변경하면 모든 수 품질 분류가 틀어집니다.

### 7-2. 수 품질 분류 임계값

**파일**: `backend/app/ml/move_classifier.py` — `THRESHOLDS`

```python
THRESHOLDS: list[tuple[str, float, float]] = [
    ("Best",       0.0,  5.0),
    ("Excellent",  5.0, 10.0),
    ("Good",      10.0, 20.0),
    ("Inaccuracy",20.0, 40.0),
    ("Mistake",   40.0, 70.0),
    ("Blunder",   70.0, 101.0),
]
```

> Chess.com 기준 분류 임계값입니다. 수정하면 프론트엔드의 도넛 차트 범례, AI 인사이트 텍스트, 전술 패턴 분류 전체가 일관성을 잃습니다.

### 7-3. 정확도 계산 공식

**파일**: `backend/app/ml/move_classifier.py`

```python
def _accuracy(avg_win_pct_loss: float) -> float:
    """Chess.com 공식: 정확도 = 103.1668 × exp(-0.04354 × L) - 3.1669"""
    return max(0.0, 103.1668 * math.exp(-0.04354 * avg_win_pct_loss) - 3.1669)
```

> Chess.com 공식 계수입니다. 임의 수정 시 사용자에게 표시되는 정확도와 Chess.com 수치 간 차이가 발생합니다.

### 7-4. ECO DB 캐시 구조

**파일**: `backend/app/services/opening_db.py` — `_by_eco`, `_by_epd` 딕셔너리 키 구조

```python
_by_eco: dict[str, dict]   # eco → { name, pgn, uci, epd }
_by_epd: dict[str, dict]   # epd → { eco, name, uci }
```

> 캐시 파일(`_eco_cache.json`)의 키 구조와 인덱스 구조를 변경하면 서버 시작 시 오프닝 DB 로드가 실패합니다.

### 7-5. Pydantic 스키마 필드명

**파일**: `backend/app/models/schemas.py`

> `Platform`, `GameResult`, `GameSummary`, `PlayerProfile` 등 핵심 스키마의 **필드명과 Enum 값**을 변경하면 프론트엔드 `types/index.ts` 전체와 `lib/api.ts` 가 깨집니다.  
> 스키마 변경 시 반드시 `types/index.ts`를 동시에 수정하고 **BREAKING CHANGE** 커밋으로 명시하세요.

### 7-6. 전술 분석 상수 (성능 예산)

**파일**: `backend/app/services/tactical_analysis.py`

```python
SF_DEPTH = 8           # Stockfish 탐색 깊이
SF_BUDGET_GAMES = 15   # 엔진 분석 대상 최대 게임 수
SF_BUDGET_MOVES = 30   # 수 분석 최대 반수
BOARD_BUDGET_GAMES = 80
```

> 이 값들은 API 응답 타임아웃(30초) 내에 분석이 완료되도록 **엄격하게 튜닝**된 수치입니다. 함부로 올리면 프론트엔드 요청이 타임아웃됩니다. 변경 시 반드시 실측 벤치마크 후 PR에 결과 첨부.

### 7-7. API 클라이언트 baseURL 및 timeout

**파일**: `frontend/src/lib/api.ts`

```typescript
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
  timeout: 30000,
});
```

> `timeout: 30000`은 전술 분석 API(Stockfish 포함)의 최대 응답 시간을 고려한 값입니다. 줄이면 정상 분석 요청이 에러로 끊깁니다.

---

## 8. 수정 시 반드시 주의할 구역

### 8-1. Stockfish 경로 설정 (환경 의존)

**파일**: `backend/app/ml/engine.py`, `backend/app/services/tactical_analysis.py`

```python
# engine.py — 자동 탐색
STOCKFISH_PATH: str = (
    shutil.which("stockfish")
    or "/opt/homebrew/bin/stockfish"
    or "/usr/local/bin/stockfish"
    or "/usr/bin/stockfish"
)

# tactical_analysis.py — 하드코딩 (주의!)
STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"
```

> `tactical_analysis.py`의 경로는 macOS Homebrew 환경 고정입니다.  
> **Linux/Docker 환경에서 작업 시 반드시 `shutil.which("stockfish")` 방식으로 통일하거나 환경변수로 추출하세요.**  
> Docker 컨테이너에서는 Stockfish를 별도 설치해야 합니다.

### 8-2. CORS Origins

**파일**: `backend/app/core/config.py`

```python
ALLOWED_ORIGINS: List[str] = [
    "http://localhost:3000",
    "https://foresight.vercel.app",
]
```

> 새 배포 도메인이 생기면 반드시 여기에 추가하세요. 누락 시 프론트엔드 API 호출이 브라우저에서 차단됩니다.

### 8-3. React Query 전역 설정

**파일**: `frontend/src/components/layout/Providers.tsx`

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1분
      retry: 1,
    },
  },
})
```

> `staleTime`을 늘리면 최신 게임 데이터가 즉시 반영되지 않습니다. `retry`를 늘리면 Stockfish 분석처럼 느린 요청이 중복 실행될 수 있습니다.

### 8-4. PGN 클럭 파싱 정규식

**파일**: `backend/app/services/pgn_parser.py`, `backend/app/services/tactical_analysis.py`

```python
_RE_CLK = re.compile(r"\[%clk\s+(\d+):(\d{2}):(\d{2})\]")
_RE_EMT = re.compile(r"\[%emt\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]")
```

> Chess.com과 Lichess의 PGN 클럭 포맷이 미세하게 다릅니다 (소수점 초 여부).  
> 두 파일에 **동일한 정규식이 중복 정의**되어 있으니 수정 시 **두 곳 모두** 업데이트하세요.

### 8-5. 게임 페이즈 분류 기준

**파일**: `backend/app/services/pgn_parser.py`

```python
# opening : 수 1~10
# middlegame : 수 11~30
# endgame : 수 31+
```

> 이 기준은 `tactical_analysis.py`의 TimePressurePhase 분류와 연동됩니다. 수정하면 프론트엔드 `TimePressurePerMove` 차트 레이블이 불일치합니다.

### 8-6. OpenAI 모델명 및 프롬프트

**파일**: `backend/app/services/ai_insights.py`

```python
model="gpt-4o-mini",
temperature=0.65,
max_tokens=900,
response_format={"type": "json_object"},
```

> `response_format: json_object`를 제거하면 GPT 응답이 JSON이 아닌 마크다운이 되어 파싱 에러가 납니다.  
> `max_tokens`를 크게 올리면 API 비용이 선형 증가합니다.  
> 프롬프트 수정 시 반드시 JSON 응답 구조(`strengths`, `weaknesses`, `focus_area`, `training_plan`)를 유지하세요.

### 8-7. opening_db 캐시 파일

**파일**: `backend/app/services/_eco_cache.json`

> 이 파일은 서버 시작 시 GitHub에서 자동 다운로드되어 생성됩니다.  
> **직접 편집 금지.** Git에서 ignore 여부를 확인하고 커밋에 포함시키지 마세요.  
> 캐시가 손상되면 파일을 삭제 후 서버를 재시작하면 자동 재생성됩니다.

### 8-8. 대시보드 쿼리 enabled 조건

**파일**: `frontend/src/app/dashboard/page.tsx`

```typescript
const enabled = !!submitted;
// 모든 useQuery는 enabled 옵션을 반드시 포함해야 함
useQuery({ ..., enabled });
```

> `enabled` 조건 없이 마운트 즉시 쿼리가 실행되면 username 없이 API가 호출되어 에러가 발생합니다.

---

## 9. API 설계 규칙

### URL 구조

```
GET /api/v1/{resource}/{platform}/{username}
```

- `platform` 값: `chess.com` 또는 `lichess` (Pydantic `Platform` Enum)
- 경로 파라미터는 **snake_case** 유지
- 새 엔드포인트는 반드시 기존 5개 라우터 중 적합한 곳에 추가

### Query Parameter 기본값

| 파라미터 | 기본값 | 범위 |
|----------|--------|------|
| `time_class` | `blitz` | `bullet\|blitz\|rapid\|classical` |
| `max_games` | `100` | `10~500` |
| `top_n` | `10` | `1~30` |

> 범위를 변경하면 프론트엔드 `lib/api.ts` 의 기본값과 불일치가 생깁니다.

### 에러 처리

```python
# 모든 라우터 함수는 반드시 try/except 포함
try:
    ...
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

> 세분화된 HTTP 상태코드 (`404`, `422`) 도입 시 프론트엔드 에러 처리도 함께 수정하세요.

---

## 10. 환경변수 관리

| 변수명 | 위치 | 필수 여부 | 설명 |
|--------|------|-----------|------|
| `OPENAI_API_KEY` | `.env` (루트) | 선택 | 없으면 규칙 기반 폴백 |
| `LICHESS_API_TOKEN` | `.env` (루트) | 선택 | 없으면 public API 사용 (레이트 리밋 낮음) |
| `NEXT_PUBLIC_API_URL` | `.env` (루트) | 선택 | 기본값 `http://localhost:8000/api/v1` |

**절대 규칙:**
- `.env` 파일은 절대 Git에 커밋하지 않습니다 (`.gitignore` 확인)
- API 키를 코드에 하드코딩하지 않습니다
- `config.py`의 `Settings` 클래스를 통해서만 접근합니다

---

## 11. 테스트 정책

### 기존 테스트 파일

- `backend/test_integration.py` — 전체 API 통합 테스트
- `backend/test_opening.py` — ECO 오프닝 DB 캐시 로드 테스트

### 테스트 실행

```bash
cd backend
source .venv/bin/activate
python -m pytest test_integration.py -v
python -m pytest test_opening.py -v
```

### 테스트 작성 규칙

- 새 서비스 함수 추가 시 단위 테스트 필수
- 전술 분석 패턴 추가 시 `test_integration.py`에 API 엔드 투 엔드 케이스 추가
- Stockfish 의존 테스트는 `@pytest.mark.skipif(not shutil.which("stockfish"), ...)` 로 환경 분기
- 프론트엔드 테스트: (미구현) 추후 Vitest + React Testing Library 도입 예정

---

## 빠른 참조 — 자주 하는 작업

### 새 전술 패턴 추가

1. `MVP.md` 에 패턴 문서화
2. `backend/app/services/tactical_analysis.py` 에 분석 로직 추가
3. `backend/app/models/schemas.py` 에 응답 필드 추가 (BREAKING CHANGE 여부 확인)
4. `frontend/src/types/index.ts` 동기화
5. `frontend/src/components/charts/TacticalPatternsCard.tsx` 업데이트
6. 커밋: `feat(tactical): <패턴명> 분석 추가`

### 새 차트 컴포넌트 추가

1. `frontend/src/components/charts/<ComponentName>.tsx` 생성
2. `frontend/src/types/index.ts` 에 Props 관련 타입 추가
3. `frontend/src/lib/api.ts` 에 API 함수 추가 (필요 시)
4. 대응하는 Skeleton 컴포넌트를 `SkeletonCard.tsx` 에 추가
5. 커밋: `feat(charts): <차트명> 컴포넌트 추가`

### 외부 API 연동 변경

1. `backend/app/services/chessdotcom.py` 또는 `lichess.py` 수정
2. 반환 타입이 `GameSummary` 리스트인지 확인 — 라우터와 분석 서비스가 이 타입에 의존
3. 커밋: `feat(api): <플랫폼> API <변경 내용>`
