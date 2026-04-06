# Stockfish 게임 분석 성능/최적화 효율 리포트

작성일: 2026-04-06  
대상: Foresight 백엔드 Stockfish 기반 게임 분석(SSE)

## 1) 분석 범위와 방법

이 리포트는 아래 파일을 기준으로 **코드 우선(code-first)** 분석을 수행했습니다.

- 라우트/스케줄링: [backend/app/api/routes/game_analysis.py](../backend/app/api/routes/game_analysis.py)
- 분석 로직: [backend/app/ml/game_analyzer.py](../backend/app/ml/game_analyzer.py)
- 설정값: [backend/app/core/config.py](../backend/app/core/config.py)
- 운영 문서: [docs/analysis-scheduling-and-logic.md](./analysis-scheduling-and-logic.md), [docs/azure-deployment.md](./azure-deployment.md)
- 관련 테스트: [backend/test_game_analysis_queue.py](../backend/test_game_analysis_queue.py)

주의:

- 본 리포트는 **실운영 부하 실측값(p95, CPU 사용량, 큐 대기 시간)** 없이, 코드 구조와 현재 설정을 기반으로 한 효율 분석입니다.
- 운영 환경별 vCPU/메모리/스케일 정책에 따라 절대 성능 수치는 달라집니다.

---

## 2) 현재 아키텍처 성능 경로 요약

### 요청 처리 경로

1. 클라이언트가 SSE 엔드포인트 호출: [backend/app/api/routes/game_analysis.py#L283](../backend/app/api/routes/game_analysis.py#L283)
2. 즉시 queued 이벤트 송신 후 실행 슬롯 대기/진입: [backend/app/api/routes/game_analysis.py#L347](../backend/app/api/routes/game_analysis.py#L347)
3. 동기 분석 작업을 thread pool로 위임: [backend/app/api/routes/game_analysis.py#L359](../backend/app/api/routes/game_analysis.py#L359)
4. 워커 스레드는 move 단위 이벤트를 큐로 전달하고, async 레이어는 SSE로 flush
5. 완료 이벤트까지 전송 후 캐시에 저장

### 동시성 제어(현재)

- 동일 사용자 직렬화 슬롯: [backend/app/api/routes/game_analysis.py#L95](../backend/app/api/routes/game_analysis.py#L95)
- 전역 동시성 세마포어(선택): [backend/app/api/routes/game_analysis.py#L74](../backend/app/api/routes/game_analysis.py#L74)
- 결합 실행 슬롯: [backend/app/api/routes/game_analysis.py#L120](../backend/app/api/routes/game_analysis.py#L120)

즉, 현재는

- 같은 사용자 요청은 순차 처리
- 다른 사용자 요청은 전역 세마포어 설정(STOCKFISH_CONCURRENT)에 따라 병렬/대기

### 캐시(현재)

- LRU 최대 50개: [backend/app/api/routes/game_analysis.py#L148](../backend/app/api/routes/game_analysis.py#L148)
- TTL 1시간: [backend/app/api/routes/game_analysis.py#L149](../backend/app/api/routes/game_analysis.py#L149)
- 키: (game_id 또는 pgn 해시, depth): [backend/app/api/routes/game_analysis.py#L168](../backend/app/api/routes/game_analysis.py#L168)

캐시 히트 시 Stockfish 재실행 없이 init/move/complete 이벤트를 재생합니다.

---

## 3) 적용된 최적화 항목과 효율 평가

### 3.1 스케줄링/운영 레이어

| 항목 | 구현 위치 | 효율 평가 | 비고 |
|---|---|---|---|
| 동일 사용자 직렬화 | [backend/app/api/routes/game_analysis.py#L95](../backend/app/api/routes/game_analysis.py#L95) | 높음 | 사용자 체감에서 중복 분석 폭주를 강하게 억제 |
| 전역 동시성 상한(옵션) | [backend/app/api/routes/game_analysis.py#L74](../backend/app/api/routes/game_analysis.py#L74) | 중간~높음 | 소형 인스턴스 보호에 효과적. 0이면 앱 내부 상한 없음 |
| SSE keepalive | [backend/app/api/routes/game_analysis.py#L385](../backend/app/api/routes/game_analysis.py#L385) | 중간 | 장시간 분석 중 프록시 타임아웃/유휴 끊김 완화 |
| 클라이언트 disconnect 감지/취소 신호 | [backend/app/api/routes/game_analysis.py#L374](../backend/app/api/routes/game_analysis.py#L374) | 중간 | 불필요한 후속 move 분석 억제(수 단위 중단) |
| 결과 캐시(LRU+TTL) | [backend/app/api/routes/game_analysis.py#L148](../backend/app/api/routes/game_analysis.py#L148) | 높음(히트 시) | 재분석 회피 효과 큼. 단, 프로세스 로컬 캐시 한계 |

### 3.2 엔진/알고리즘 레이어

| 항목 | 구현 위치 | 효율 평가 | 비고 |
|---|---|---|---|
| Threads/Hash 설정값 외부화 | [backend/app/ml/game_analyzer.py#L1123](../backend/app/ml/game_analyzer.py#L1123), [backend/app/core/config.py#L39](../backend/app/core/config.py#L39) | 중간~높음 | 환경별 튜닝 가능성 확보 |
| 이전 수 MultiPV 재사용(prev_multipv) | [backend/app/ml/game_analyzer.py#L904](../backend/app/ml/game_analyzer.py#L904) | 높음 | before 포지션 재분석 호출 일부 절약 |
| 강제수/가비지타임 depth 축소 | [backend/app/ml/game_analyzer.py#L919](../backend/app/ml/game_analyzer.py#L919) | 높음 | 품질 대비 연산량 절감 효과 큼 |
| 이론수(TH) 초경량 분석 | [backend/app/ml/game_analyzer.py#L951](../backend/app/ml/game_analyzer.py#L951) | 높음 | 오프닝 구간 비용 절감 |
| depth 14+에서 정확도/추천수 분리(메인 1PV + 얕은 MultiPV) | [backend/app/ml/game_analyzer.py#L955](../backend/app/ml/game_analyzer.py#L955) | 중간~높음 | UI 정보 품질 유지 + 비용 절충 |

종합:

- **단일 요청 관점 효율**은 이미 좋은 편입니다(중복 호출 최소화, 구간별 depth 다이어트, 이벤트 스트리밍).
- **고동시성 관점 효율**은 운영 파라미터(STOCKFISH_CONCURRENT, 스케일 정책)에 크게 의존합니다.

---

## 4) 병목/리스크 분석

### A. STOCKFISH_CONCURRENT=0일 때 실질 무제한 병렬 위험

근거:

- 기본값 0: [backend/app/core/config.py#L41](../backend/app/core/config.py#L41)
- 세마포어는 0보다 클 때만 활성화: [backend/app/api/routes/game_analysis.py#L74](../backend/app/api/routes/game_analysis.py#L74)
- 분석 작업은 run_in_executor로 제출: [backend/app/api/routes/game_analysis.py#L359](../backend/app/api/routes/game_analysis.py#L359)

영향:

- 트래픽 순간 증가 시 한 레플리카에서 Stockfish 프로세스/스레드가 과도하게 겹쳐 CPU 스로틀링, tail latency 악화 가능
- 사용자 간 격리는 되지만(동일 사용자 직렬화), 전체 시스템 보호는 인프라 스케일 정책에 과의존

### B. 취소는 수(move) 경계에서만 반영

근거:

- disconnect 시 cancel_event set: [backend/app/api/routes/game_analysis.py#L374](../backend/app/api/routes/game_analysis.py#L374)
- cancel_event 체크는 다음 루프 진입 시점: [backend/app/ml/game_analyzer.py#L1134](../backend/app/ml/game_analyzer.py#L1134)

영향:

- 현재 수 계산이 매우 깊은 경우, 연결 종료 후에도 해당 수 계산은 완료될 때까지 CPU를 사용

### C. 캐시 키 충돌 가능성(동일 game_id, 다른 PGN)

근거:

- 키 생성이 game_id 우선, 없을 때만 pgn 해시 사용: [backend/app/api/routes/game_analysis.py#L168](../backend/app/api/routes/game_analysis.py#L168)

영향:

- 동일 game_id가 재사용되는 입력(커스텀/재업로드 시나리오)에서 잘못된 재생 가능성

### D. 멀티 인스턴스 환경에서 캐시 효율 저하

근거:

- 캐시가 프로세스 로컬 OrderedDict

영향:

- 스케일 아웃 시 레플리카 간 캐시 공유가 없어 히트율 분산

### E. 코드-문서 일부 불일치

관찰:

- [docs/analysis-scheduling-and-logic.md](./analysis-scheduling-and-logic.md)는 전반적으로 유효하지만, 엔진 설정/세부 limit 로직은 최신 코드와 차이가 있을 수 있음

영향:

- 운영자가 문서만 보고 튜닝하면 실제 동작과 엇갈릴 가능성

---

## 5) 효율 점수카드(정성)

| 항목 | 점수(10점) | 코멘트 |
|---|---:|---|
| 단일 요청 처리 효율 | 8.5 | 구간별 연산 다이어트와 재사용 전략이 좋음 |
| 고동시성 안정성 | 6.5 | 기본값(동시성 0)에서는 인프라 스케일 의존도가 큼 |
| 캐시 효율 | 7.0 | 단일 인스턴스는 좋음, 멀티 인스턴스는 한계 |
| 취소/자원회수 효율 | 6.5 | move 경계 취소라 깊은 수에서 지연 가능 |
| 운영 튜닝 용이성 | 8.0 | Threads/Hash/Concurrent 외부 설정 가능 |

**종합 점수: 7.3 / 10**

---

## 6) 우선순위별 개선 권고

### P0 (즉시 권장)

1. 운영 환경별 STOCKFISH_CONCURRENT 기준선 명시

- 단일 소형 인스턴스: 1
- 스케일 아웃 + 저동시 HTTP 컨커런시: 0 또는 1을 부하 테스트로 결정
- 관련 운영 가이드: [docs/azure-deployment.md#L237](./azure-deployment.md#L237)

2. 관측 지표 최소 4종 추가

- queue_wait_ms (queued → 실제 분석 시작)
- analysis_duration_ms
- cache_hit_ratio
- disconnect_cancel_count

3. 캐시 키 안전성 보강

- (game_id, pgn_hash, depth) 형태로 변경해 동일 game_id 재사용 충돌 방지

### P1 (단기 개선)

1. 큐 압력 기반 depth 적응

- 대기 길이 또는 queue_wait_ms가 임계치를 넘으면 target_depth를 단계적으로 하향

2. 취소 반응성 강화

- 장시간 계산 구간에서 취소 체크 기회를 늘리도록 분석 단위를 더 잘게 분할(가능 범위 내)

3. 문서-코드 동기화

- [docs/analysis-scheduling-and-logic.md](./analysis-scheduling-and-logic.md)에 최신 로직 반영

### P2 (중기 개선)

1. Redis 기반 분산 캐시/작업큐 검토

- 멀티 레플리카 히트율 향상
- 분석 워커 분리 시 API 레이턴시 안정화

2. 장기적으로 분석 워커 프로세스 분리

- API 서버와 Stockfish CPU 부하를 분리하여 예측 가능한 SLA 확보

---

## 7) 간단 용량/처리량 모델(운영 추정용)

기호:

- M: 게임의 총 반수(halfmove)
- Tm: 반수당 평균 분석 시간(초)
- C: 레플리카당 유효 동시 분석 수

근사식:

- 단일 게임 완료 시간 ≈ M × Tm
- 레플리카 처리량(games/s) ≈ C / (M × Tm)

주의:

- C를 크게 잡아도 CPU가 포화되면 Tm이 증가해 총 처리량이 오히려 악화될 수 있습니다.
- 따라서 C 최적점은 vCPU, Threads, depth 분포, 동시 접속 패턴에 따라 달라집니다.

---

## 8) 검증 실험 제안(다음 단계)

아래 매트릭스로 15~30분 내 빠른 부하 검증을 권장합니다.

- 동시 사용자: 1 / 3 / 5
- depth: 12 / 14 / 16
- STOCKFISH_CONCURRENT: 0 / 1 / 2

수집 지표:

- p50/p95 queue_wait_ms
- p50/p95 analysis_duration_ms
- CPU 사용률
- cache_hit_ratio
- SSE 중단율

이 결과를 기반으로 환경별 권장 프리셋(로컬, 소형 Azure, 확장형 Azure)을 확정하는 것이 가장 효율적입니다.

---

## 9) 참고 코드 위치(핵심)

- 동시성 세마포어: [backend/app/api/routes/game_analysis.py#L74](../backend/app/api/routes/game_analysis.py#L74)
- 동일 사용자 직렬화: [backend/app/api/routes/game_analysis.py#L95](../backend/app/api/routes/game_analysis.py#L95)
- 캐시 상수/키: [backend/app/api/routes/game_analysis.py#L148](../backend/app/api/routes/game_analysis.py#L148), [backend/app/api/routes/game_analysis.py#L168](../backend/app/api/routes/game_analysis.py#L168)
- executor 제출: [backend/app/api/routes/game_analysis.py#L359](../backend/app/api/routes/game_analysis.py#L359)
- keepalive: [backend/app/api/routes/game_analysis.py#L385](../backend/app/api/routes/game_analysis.py#L385)
- 엔진 설정 주입: [backend/app/ml/game_analyzer.py#L1123](../backend/app/ml/game_analyzer.py#L1123)
- prev_multipv 재사용: [backend/app/ml/game_analyzer.py#L904](../backend/app/ml/game_analyzer.py#L904)
- depth 다이어트(강제수/가비지타임): [backend/app/ml/game_analyzer.py#L919](../backend/app/ml/game_analyzer.py#L919)
- depth 14+ 분리 연산: [backend/app/ml/game_analyzer.py#L955](../backend/app/ml/game_analyzer.py#L955)
- 기본 설정값: [backend/app/core/config.py#L39](../backend/app/core/config.py#L39)