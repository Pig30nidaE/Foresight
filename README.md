# Foresight ♟️

> 체스 대회 참가자를 위한 AI 기반 대국 분석 웹서비스

## 서비스 개요

Foresight는 체스 대회에 참가하는 플레이어가 **상대 분석**, **자신의 약점 파악**, **오프닝 준비**를 할 수 있도록 돕는 분석 플랫폼입니다.

## 핵심 기능

- **Profile Dashboard** — Chess.com / Lichess 계정 연동 및 전적 요약
- **Opening Analysis** — 오프닝별 승률, 자주 발생하는 실수 패턴
- **Opponent Preparation** — 상대 플레이어의 최근 게임 분석 및 약점 리포트
- **Performance Trends** — 레이팅 변화, 시간대별/오프닝별 성과
- **Game Review** — 개별 게임 복기 및 핵심 포지션 분석

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Data/ML | Pandas, Scikit-learn, python-chess |
| External API | Chess.com Public API, Lichess API |
| DevOps | Docker, Docker Compose, Vercel |

## 프로젝트 구조

```
Foresight/
├── backend/               # FastAPI 백엔드
│   ├── app/
│   │   ├── api/routes/    # API 엔드포인트
│   │   ├── core/          # 설정, 보안
│   │   ├── models/        # Pydantic 모델
│   │   ├── services/      # 비즈니스 로직 (Chess.com, Lichess 연동)
│   │   └── ml/            # 분석 / ML 모듈
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/              # Next.js 프론트엔드
│   └── ...
├── docker-compose.yml
└── README.md
```

## 개발 단계 (Steps)

- [x] **Step 1** — 프로젝트 구조 초기화
- [ ] **Step 2** — FastAPI 백엔드 기반 세팅
- [ ] **Step 3** — Next.js 프론트엔드 기반 세팅
- [ ] **Step 4** — Chess.com / Lichess API 연동 레이어
- [ ] **Step 5** — 데이터 파이프라인 (PGN 파싱, Pandas)
- [ ] **Step 6** — 분석 엔진 (오프닝, 승률, ML 약점 탐지)
- [ ] **Step 7** — 프론트 UI / 대시보드 구현
- [ ] **Step 8** — Docker Compose + Vercel 배포 설정

## 빠른 시작

```bash
# 전체 실행
docker-compose up --build

# 백엔드만 (개발)
cd backend && uvicorn app.main:app --reload

# 프론트엔드만 (개발)
cd frontend && npm run dev
```
