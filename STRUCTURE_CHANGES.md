# Foresight — 폴더 구조 변경 기록

> **작업 날짜**: 2025  
> **목적**: 다중 개발자 협업 시 git conflict 최소화를 위한 feature-based 폴더 구조 도입

---

## 목차

1. [배경 및 목적](#1-배경-및-목적)
2. [개발자별 소유 영역](#2-개발자별-소유-영역)
3. [백엔드 구조 변경](#3-백엔드-구조-변경)
4. [프론트엔드 구조 변경](#4-프론트엔드-구조-변경)
5. [파일 이동 매핑표](#5-파일-이동-매핑표)
6. [신규 기능 추가 가이드](#6-신규-기능-추가-가이드)

---

## 1. 배경 및 목적

기존 flat 구조(`services/`, `components/` 단일 폴더)에서는 여러 개발자가 같은 파일을 수정하거나, 관련 없는 기능의 코드가 섞여 conflict가 빈번하게 발생했습니다.

**변경 후 원칙**:
- 각 기능(feature)은 독립된 폴더를 가집니다.
- 공유 코드만 `shared/`에 위치합니다.
- 개발자는 자신의 feature 폴더만 수정하면 됩니다.
- 기존 import 경로는 배럴 파일로 하위 호환성을 유지합니다.

---

## 2. 개발자별 소유 영역

| 개발자 | 담당 기능 | 백엔드 경로 | 프론트엔드 경로 |
|--------|----------|------------|----------------|
| **Dev1 (유저)** | 대시보드 분석 | `app/features/dashboard/` | `src/features/dashboard/` |
| **Dev1 (유저)** | 상대 분석 | `app/features/opponent/` | `src/features/opponent/` |
| **Dev2** | 오프닝 티어표 | `app/features/opening_tier/` | `src/features/opening-tier/` |
| **Future** | 커뮤니티/공지 | `app/features/community/` | `src/features/community/` |
| **공통** | 공유 서비스/컴포넌트 | `app/shared/` | `src/shared/` |

> **충돌 방지 규칙**: 자신의 feature 폴더 외부(`shared/`, `api/routes/`, `app/`)를 수정할 때는 반드시 팀원에게 알린 후 진행하세요.

---

## 3. 백엔드 구조 변경

### 3-1. 변경 전 (Before)

```
backend/app/
├── main.py
├── core/
├── ml/
├── models/
├── api/
│   └── routes/
│       ├── stats.py
│       ├── analysis.py
│       ├── engine.py
│       ├── games.py
│       └── player.py
└── services/            ← 모든 서비스가 평탄하게 나열
    ├── chessdotcom.py
    ├── lichess.py
    ├── pgn_parser.py
    ├── opening_db.py
    ├── analysis.py
    ├── tactical_analysis.py
    ├── ai_insights.py
    └── opponent_analysis.py
```

### 3-2. 변경 후 (After)

```
backend/app/
├── main.py
├── core/
├── ml/
├── models/
├── api/
│   └── routes/
│       ├── stats.py
│       ├── analysis.py
│       ├── engine.py
│       ├── games.py
│       ├── player.py
│       ├── opening_tier.py   ← NEW (Dev2 placeholder)
│       └── community.py      ← NEW (Future placeholder)
├── shared/
│   └── services/             ← 여러 기능에서 공유하는 서비스
│       ├── chessdotcom.py
│       ├── lichess.py
│       ├── pgn_parser.py
│       └── opening_db.py
└── features/
    ├── dashboard/
    │   └── services/         ← Dev1 소유
    │       ├── analysis.py
    │       ├── tactical_analysis.py
    │       └── ai_insights.py
    ├── opponent/
    │   └── services/         ← Dev1 소유
    │       └── opponent_analysis.py
    ├── opening_tier/
    │   └── services/         ← Dev2 소유
    │       └── opening_tier_service.py
    └── community/
        └── services/         ← Future
            └── community_service.py
```

---

## 4. 프론트엔드 구조 변경

### 4-1. 변경 전 (Before)

```
frontend/src/
├── app/
│   ├── dashboard/page.tsx
│   ├── opponent/page.tsx
│   └── analysis/page.tsx
├── components/
│   ├── charts/              ← 모든 차트가 평탄하게 나열
│   │   ├── BestWorstCard.tsx
│   │   ├── BlunderTimeline.tsx
│   │   ├── FirstMoveBar.tsx
│   │   ├── MoveQualityDonut.tsx
│   │   ├── OpeningsChart.tsx
│   │   ├── OpeningTreeTable.tsx
│   │   ├── RatingTrendChart.tsx
│   │   └── TacticalPatternsCard.tsx
│   ├── modals/
│   │   ├── OpeningGameListModal.tsx
│   │   └── PatternGameListModal.tsx
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Providers.tsx
│   └── ui/
│       ├── SearchForm.tsx
│       ├── SectionHeader.tsx
│       ├── SkeletonCard.tsx
│       └── StatCard.tsx
├── types/
│   └── index.ts             ← 모든 타입이 한 파일에
└── lib/
    └── api.ts               ← 모든 API 함수가 한 파일에
```

### 4-2. 변경 후 (After)

```
frontend/src/
├── app/
│   ├── dashboard/page.tsx
│   ├── opponent/page.tsx
│   ├── analysis/page.tsx
│   ├── opening-tier/page.tsx   ← NEW (Dev2 placeholder)
│   └── community/page.tsx      ← NEW (Future placeholder)
├── features/
│   ├── dashboard/              ← Dev1 소유
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   │   ├── BestWorstCard.tsx
│   │   │   │   ├── BlunderTimeline.tsx
│   │   │   │   ├── FirstMoveBar.tsx
│   │   │   │   ├── MoveQualityDonut.tsx
│   │   │   │   ├── OpeningsChart.tsx
│   │   │   │   ├── OpeningTreeTable.tsx
│   │   │   │   ├── RatingTrendChart.tsx
│   │   │   │   └── TacticalPatternsCard.tsx
│   │   │   └── modals/
│   │   │       ├── OpeningGameListModal.tsx
│   │   │       └── PatternGameListModal.tsx
│   │   ├── api.ts              ← 대시보드 API 함수
│   │   └── types.ts            ← 대시보드 전용 타입
│   ├── opponent/               ← Dev1 소유
│   │   ├── api.ts
│   │   └── types.ts
│   ├── opening-tier/           ← Dev2 소유
│   │   ├── api.ts
│   │   └── types.ts
│   └── community/              ← Future
│       ├── api.ts
│       └── types.ts
├── shared/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx
│   │   │   └── Providers.tsx
│   │   └── ui/
│   │       ├── SearchForm.tsx
│   │       ├── SectionHeader.tsx
│   │       ├── SkeletonCard.tsx
│   │       └── StatCard.tsx
│   ├── lib/
│   │   └── api.ts              ← base axios 인스턴스 + 공유 API
│   └── types/
│       └── index.ts            ← 공유 타입 (Platform, GameSummary 등)
├── types/
│   └── index.ts                ← 하위 호환 배럴 (export * re-export만)
└── lib/
    └── api.ts                  ← 하위 호환 배럴 (export * re-export만)
```

---

## 5. 파일 이동 매핑표

### 백엔드

| 원래 경로 | 새 경로 | 비고 |
|-----------|---------|------|
| `app/services/chessdotcom.py` | `app/shared/services/chessdotcom.py` | 공유 서비스 |
| `app/services/lichess.py` | `app/shared/services/lichess.py` | 공유 서비스 |
| `app/services/pgn_parser.py` | `app/shared/services/pgn_parser.py` | 공유 서비스 |
| `app/services/opening_db.py` | `app/shared/services/opening_db.py` | 공유 서비스 |
| `app/services/analysis.py` | `app/features/dashboard/services/analysis.py` | Dev1 |
| `app/services/tactical_analysis.py` | `app/features/dashboard/services/tactical_analysis.py` | Dev1 |
| `app/services/ai_insights.py` | `app/features/dashboard/services/ai_insights.py` | Dev1 |
| `app/services/opponent_analysis.py` | `app/features/opponent/services/opponent_analysis.py` | Dev1 |

### 프론트엔드

| 원래 경로 | 새 경로 | 비고 |
|-----------|---------|------|
| `components/charts/BestWorstCard.tsx` | `features/dashboard/components/charts/BestWorstCard.tsx` | Dev1 |
| `components/charts/BlunderTimeline.tsx` | `features/dashboard/components/charts/BlunderTimeline.tsx` | Dev1 |
| `components/charts/FirstMoveBar.tsx` | `features/dashboard/components/charts/FirstMoveBar.tsx` | Dev1 |
| `components/charts/MoveQualityDonut.tsx` | `features/dashboard/components/charts/MoveQualityDonut.tsx` | Dev1 |
| `components/charts/OpeningsChart.tsx` | `features/dashboard/components/charts/OpeningsChart.tsx` | Dev1 |
| `components/charts/OpeningTreeTable.tsx` | `features/dashboard/components/charts/OpeningTreeTable.tsx` | Dev1 |
| `components/charts/RatingTrendChart.tsx` | `features/dashboard/components/charts/RatingTrendChart.tsx` | Dev1 |
| `components/charts/TacticalPatternsCard.tsx` | `features/dashboard/components/charts/TacticalPatternsCard.tsx` | Dev1 |
| `components/modals/OpeningGameListModal.tsx` | `features/dashboard/components/modals/OpeningGameListModal.tsx` | Dev1 |
| `components/modals/PatternGameListModal.tsx` | `features/dashboard/components/modals/PatternGameListModal.tsx` | Dev1 |
| `components/layout/Navbar.tsx` | `shared/components/layout/Navbar.tsx` | 공유 |
| `components/layout/Providers.tsx` | `shared/components/layout/Providers.tsx` | 공유 |
| `components/ui/SearchForm.tsx` | `shared/components/ui/SearchForm.tsx` | 공유 |
| `components/ui/SectionHeader.tsx` | `shared/components/ui/SectionHeader.tsx` | 공유 |
| `components/ui/SkeletonCard.tsx` | `shared/components/ui/SkeletonCard.tsx` | 공유 |
| `components/ui/StatCard.tsx` | `shared/components/ui/StatCard.tsx` | 공유 |

---

## 6. 신규 기능 추가 가이드

새 기능을 추가할 때는 아래 패턴을 따르세요.

### 백엔드 신규 기능 (`my-feature`)

```
backend/app/
├── api/routes/my_feature.py          ← 1. 라우터 파일 생성
└── features/my_feature/
    ├── __init__.py
    └── services/
        ├── __init__.py
        └── my_feature_service.py     ← 2. 서비스 파일 생성
```

`main.py`에 라우터 등록:
```python
from app.api.routes import my_feature
app.include_router(my_feature.router, prefix="/api/v1/my-feature", tags=["My Feature"])
```

### 프론트엔드 신규 기능 (`my-feature`)

```
frontend/src/
├── app/my-feature/
│   └── page.tsx              ← 1. 페이지 생성
└── features/my-feature/
    ├── components/           ← 2. 컴포넌트 폴더
    ├── api.ts                ← 3. API 함수
    └── types.ts              ← 4. 타입 정의
```

`shared/components/layout/Navbar.tsx`에 메뉴 추가:
```tsx
{ href: "/my-feature", label: "기능명" }
```

하위 호환 배럴에 추가 (선택사항):
```typescript
// types/index.ts
export * from "@/features/my-feature/types";

// lib/api.ts
export * from "@/features/my-feature/api";
```

### 공유 코드 수정 시 주의사항

`shared/` 폴더 수정은 모든 기능에 영향을 줍니다.
- PR 전에 반드시 팀원에게 알리세요
- 타입 추가/변경 시 기존 인터페이스를 깨지 않도록 하세요
- `shared/lib/api.ts`의 axios 인스턴스 설정 변경은 특히 주의하세요
