# 분석 스케줄링 및 분석 로직 상세

Foresight **개별 게임 분석**의 **요청 스케줄링**(동시성·캐시·SSE)과 **Stockfish 기반 분석 로직**을 코드 기준으로 정리한 문서입니다.

> 현재 분석 API는 **SSE `POST /api/v1/game-analysis/game/stream`** 입니다.

---

## 1. 엔드포인트와 파일 맵

| 구분 | 내용 |
|------|------|
| HTTP | `POST /api/v1/game-analysis/game/stream` |
| 응답 | `text/event-stream` (SSE) |
| 라우트·스케줄링·캐시 | [`backend/app/api/routes/game_analysis.py`](../backend/app/api/routes/game_analysis.py) |
| 분석 알고리즘 | [`backend/app/ml/game_analyzer.py`](../backend/app/ml/game_analyzer.py) |
| 프론트 스트림 소비 | [`frontend/src/shared/lib/api.ts`](../frontend/src/shared/lib/api.ts) — `streamGameAnalysis` |
| UI 상태·진행률 | [`frontend/src/features/dashboard/components/GameHistorySection.tsx`](../frontend/src/features/dashboard/components/GameHistorySection.tsx) — `useAnalysisStream` |
| SSE 이벤트 타입 | [`frontend/src/shared/types/index.ts`](../frontend/src/shared/types/index.ts) — `AnalysisSSEEvent` |

라우터 등록: [`backend/app/main.py`](../backend/app/main.py) — `prefix="/api/v1/game-analysis"`.

---

## 2. SSE 이벤트 스펙

클라이언트는 `data: {JSON}\n\n` 라인을 파싱합니다.

| `type` | 의미 | 비고 |
|--------|------|------|
| `queued` | 대기 상태 알림 | 캐시 히트 시에도 동일하게 먼저 전송 |
| `init` | PGN 파싱·총 수·플레이어·오프닝 메타 | `total_moves`, `white_player`, `black_player`, `opening` |
| `move` | 반수 1개 분석 완료 | `data`에 `AnalyzedMove`와 동일 필드 (JSON) |
| `complete` | 전체 종료 + 요약 | `white` / `black`: `accuracy`, `tier_counts`, `tier_percentages`, `avg_cp_loss`, `total_moves`, `username`, `color` 등 |
| `error` | 실패 | `message` |

Keepalive: 이벤트가 0.5초 동안 없으면 `: keepalive\n\n` 전송.

응답 헤더: `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive` (Nginx 버퍼링 완화).

---

## 3. 백엔드 스케줄링 상세

### 3.1 요청 처리 순서

1. **PGN 검증** — 비어 있으면 즉시 `error` 이벤트만 담은 스트림.
2. **캐시 키** — `_cache_key(game_id, pgn, stockfish_depth)`  
   - `game_id`가 비어 있으면 `sha1(pgn)[:16]`을 uid로 사용.
3. **캐시 조회** (`_cache_get`)  
   - **히트**: Semaphore를 거치지 않고, 저장된 `init` → 모든 `move` → `complete`를 즉시 재생.
   - **미스**: 아래 4번으로 진행.
4. **스트림 생성** (`event_generator`)
   - 즉시 `queued` 전송.
   - `async with _analysis_semaphore:` 로 **슬롯 획득** (아래 3.2).
   - `ThreadPoolExecutor`(기본)에서 `_run_analysis` 실행.
   - 동기 스레드가 `queue.Queue`에 이벤트를 넣고, async 쪽은 `run_in_executor`로 `q.get(timeout=0.5)`를 반복해 SSE로 flush.
   - `None` 수신 시 루프 종료 후 `future` await.

### 3.2 동시성: `STOCKFISH_CONCURRENT` (선택적 Semaphore)

```python
# STOCKFISH_CONCURRENT > 0 일 때만 asyncio.Semaphore 사용. 0(기본)이면 세마포어 없음.
```

- **의미**: **레플리카(프로세스)당** 동시 Stockfish 분석 상한을 둘지 여부.
  - **0(기본)**: 앱 레벨에서 유저끼리 **서로 끝날 때까지 기다리지 않음** — 요청마다 즉시 `_run_analysis` 스레드가 돈다. 같은 1 vCPU 박스에 여러 분석이 겹치면 CPU는 공유되어 각각 느려질 수 있음.
  - **1 이상**: 그 개수만큼만 병렬, 나머지는 `async with` 에서 대기 (저사양 단일 인스턴스 보호).
- **캐시 히트**는 Semaphore를 사용하지 않음 (즉시 재생).
- **Azure Container Apps**: `STOCKFISH_CONCURRENT=0` 이면 **HTTP 스케일·max replicas**로 사용자를 여러 레플리카에 나누는 것이 “독립 실행”에 가깝다.
- **운영 영향**
  - CPU·메모리 보호에 유리.
  - 동시 요청이 많으면 나머지는 `queued` 이후 **슬롯이 날 때까지 대기** (asyncio 세마포어 대기 큐 순서, 일반적으로 선입선출에 가깝음).
  - **깊은 depth·긴 대국**이 먼저 슬롯을 잡으면 뒤쪽 사용자의 **분석 시작 시각**이 크게 밀릴 수 있음 (head-of-line blocking). depth·예상 시간 기준 우선순위 큐는 **현재 없음**.

### 3.3 인메모리 캐시 (SSE 재생용)

| 항목 | 값 |
|------|-----|
| 구조 | `OrderedDict[(uid, depth), _StreamCacheEntry]` |
| 엔트리 | `init_event`, `move_events[]`, `complete_event`, 타임스탬프 |
| TTL | `_CACHE_TTL_SEC = 3600` (1시간) |
| 최대 개수 | `_CACHE_MAXSIZE = 50` (LRU: 초과 시 가장 오래된 항목 제거) |
| 동기화 | `_cache_lock` (`threading.Lock`) — executor 스레드의 `_cache_set`과 async 경로의 `_cache_get` 모두 보호 |

**저장 시점**: `_run_analysis`에서 Stockfish 분석이 성공하고 `complete` 이벤트를 큐에 넣은 뒤, 동일 내용을 `_cache_set`으로 저장. **실패 시 캐시하지 않음**.

**한계**: 프로세스 로컬 캐시이므로 **워커/인스턴스가 여러 개**이면 인스턴스마다 별도 캐시. 스티키 세션이 없으면 히트율이 낮아질 수 있음.

### 3.4 `_run_analysis` (워커 스레드)

- `on_init` / `on_move` 콜백으로 큐에 이벤트 적재 + `move_events` 버퍼 축적.
- `analyze_game_streaming(...)` 호출.
- 성공 시 `complete` 적재 후 `_StreamCacheEntry` 구성 및 `_cache_set`.
- `finally`: 큐에 `None` (스트림 종료 신호).

---

## 4. 분석 로직 상세 (`game_analyzer.py`)

### 4.1 진입점: `analyze_game_streaming`

- PGN 파싱, 플레이어 이름, `_compute_opening_theory`, **총 반수** 계산 후 `on_init(...)`.
- `SimpleEngine.popen_uci(STOCKFISH_PATH)` 로 **요청당 Stockfish 프로세스 1개** (context manager 종료 시 종료).
- `engine.configure({"Threads": 2, "Hash": 256})` — 탐색 병렬화 및 해시 테이블.
- 메인 루프: PGN의 각 변화를 따라가며 `_analyze_single_move_with_fen` 호출 → `on_move(_analyzed_move_to_dict(...))`.
- 종료 후 `PlayerAnalysisResult`(백/흑) 및 `BothPlayersAnalysisResult` 생성.

`time_per_move` / `time_per_multi`는 스트리밍 경로에서 고정 상수로 전달됨 (depth 미지정 시 시간 제한에 사용).

### 4.2 반수 단위: `_analyze_single_move_with_fen`

1. **TF(강제수)**: 합법수 1개, 또는 특정 체크 상황에서 안전한 수가 유저 수 하나뿐이면 TF.
2. **단일 PV 평가 limit**
   - `stockfish_depth`가 있으면 `Limit(depth=stockfish_depth)` 만 사용 (시간 제한 없음 → 기기 속도와 무관하게 목표 depth까지).
   - 없으면 `Limit(time=time_per_move)`.
3. **`cp_before`**: 직전 수의 `info_after`(`prev_info_after`)가 있으면 **재사용**해 `engine.analyse` 1회 절약.
4. 수 적용 후 **`cp_after`** — `engine.analyse(board_after, limit)`.
5. `cp_loss`, 승률 손실 등 계산.
6. **MultiPV** (`_get_top_moves`): 보드를 수 전으로 되돌린 뒤 실행.
   - `top_n=3`
   - `multi_depth = max(10, stockfish_depth - 6)` (depth 지정 시), 아니면 시간 제한 모드.
7. **티어** `_determine_tier` → 브릴리언트 후보 시 T1 상향 → 오프닝 DB 일치 시 TH → TF 최우선.
8. 반환: `(AnalyzedMove, info_after)` — 다음 반수에서 `prev_info_after`로 전달.

### 4.3 `_get_top_moves`

- `engine.analyse(board, limit, multipv=top_n)`.
- `limit`은 인자 `depth`가 있으면 depth 전용, 없으면 `time=time_limit`.

### 4.4 정확도·통계: `PlayerAnalysisResult.__post_init__`

- 티어별 개수·비율, 평균 `cp_loss`.
- `accuracy = _compute_accuracy(analyzed_moves)` — 주석상 **Lichess식 per-move 조화평균**, **TH(이론수) 제외**.

### 4.5 결정론·변동 요인 (운영 시 이해용)

- **메인 라인**은 depth 고정 시 재현성이 높게 설계되어 있으나, **`Threads: 2`** 는 Stockfish 특성상 **완전 결정론을 보장하지 않을 수 있음**.
- **MultiPV**는 메인 depth보다 얕은 depth를 쓰는 경우가 있어, 경계 구간에서 순위·티어가 미세하게 달라질 여지가 있음.
- **`stockfish_depth`가 None**이면 시간 제한 기반이라 **부하에 따라 결과가 달라질 수 있음**.

---

## 5. 프론트엔드 스트리밍·UI

### 5.1 `streamGameAnalysis` (`api.ts`)

- `fetch(POST .../game/stream, { body: JSON, signal })`.
- `response.body.getReader()`로 청크 수신, `\n\n` 단위로 분리, `data: ` 접두어 JSON 파싱 후 `AsyncGenerator`로 `yield`.
- HTTP 오류 시 `{ type: "error", message }` 한 번 yield.

### 5.2 `useAnalysisStream` (`GameHistorySection.tsx`)

- `useReducer`로 `idle | queued | streaming | complete | error` 관리.
- `start()` 시 `AbortController`로 이전 요청 취소 후 `streamGameAnalysis` 소비.
- **설정의 `stockfishDepth` 변경** 시: 훅 내부에서 이전 depth와 다르면 abort + `RESET` (결과 무효화).
- `complete` 시 서버 요약과 수집한 `move[]`로 `BothPlayersAnalysis` 형태 조합 → `GameAnalysisPanel`에 전달.
- 진행률: `streaming`이고 `total_moves > 0`이면 `currentMove / total_moves` 기반 퍼센트 바.

---

## 6. 장점·한계 요약

| 장점 | 한계 |
|------|------|
| 긴 분석도 중간 이벤트로 연결 유지·진행률 표시 | `STOCKFISH_CONCURRENT>0` 이거나 스케일 지연 시 한 인스턴스에 몰려 대기·CPU 공유 |
| 동일 게임·depth 재요청은 캐시로 Stockfish 미실행 | 인메모리·단일 인스턴스 기준 캐시 (스케일 아웃 시 히트율 분산) |
| depth 고정 시 기기 속도와 분리된 목표 depth 탐색 | 멀티스레드·MultiPV 정책으로 “완전 동일 숫자” 보장은 어려울 수 있음 |

---

## 7. 운영 체크리스트 (현 코드 기준)

1. vCPU·비용에 맞춰 `STOCKFISH_CONCURRENT`·`Threads`/`Hash`와 Container Apps **HTTP 스케일·max replicas** 검토 ([azure-deployment.md](./azure-deployment.md) 동시 분석 절).
2. `queued` 대기 시간·캐시 히트율·평균 분석 시간 로깅/메트릭.
3. 리버스 프록시 앞단에서 SSE 버퍼링 비활성화 (`X-Accel-Buffering: no`는 이미 응답에 포함).
4. 트래픽 증가 시 **외부 작업 큐**(Redis 등) + 전용 워커로 확장 검토.
5. 사용자별·IP별 동시 분석 제한(레이트 리밋)으로 장시간 독점 완화 검토.

---

## 8. 관련 문서

- [azure-deployment.md](./azure-deployment.md) — Vercel(프론트) + Azure for Students(API)
