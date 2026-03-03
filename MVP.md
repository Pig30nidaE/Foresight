# Foresight — MVP 상황 분석 설계서

---

## 0. 폴더 소유권 (Conflict 방지 가이드)

merge 시 충돌 방지를 위해 각 개발자가 **단독 소유**하는 폴더를 명확히 구분합니다.
**공유 영역은 반드시 PR 리뷰 후 merge하고, 단독 영역은 자유롭게 수정합니다.**

### Dev1 — `feat/opponent-analysis` 브랜치 (단독 소유)

```
backend/
  app/
    features/
      opponent/          ← 상대 분석 서비스 전체
        services/
          opponent_analysis.py

frontend/src/
  features/
    opponent/            ← 상대 분석 UI 전체
      components/
      api.ts
  app/
    opponent/            ← /opponent 페이지 전체
```

### Dev2 — 별도 브랜치 (단독 소유 예정)

```
backend/
  app/
    features/
      opening_tier/      ← 오프닝 티어 서비스
      community/         ← 커뮤니티 서비스

frontend/src/
  features/
    opening-tier/        ← 오프닝 티어 UI
    community/           ← 커뮤니티 UI
  app/
    opening-tier/
    community/
```

### 공유 영역 (PR 리뷰 필수 — 양측 수정 금지)

| 경로 | 수정 시 주의사항 |
|------|-----------------|
| `backend/app/api/routes/stats.py` | 엔드포인트 추가 시 기존 라우트 건드리지 말 것 |
| `backend/app/shared/services/chessdotcom.py` | 버그 수정만 허용, 기능 추가는 PR 필수 |
| `backend/app/shared/services/lichess.py` | 동상 |
| `backend/app/features/dashboard/` | 대시보드 UI·서비스는 합의 후 수정 |
| `frontend/src/features/dashboard/` | 동상 |
| `frontend/src/app/dashboard/page.tsx` | 동상 |
| `backend/app/models/schemas.py` | 스키마 변경은 반드시 양측 공지 |
| `frontend/src/shared/` | 공용 컴포넌트·lib·타입 — PR 필수 |

---

## 1. 핵심 원칙: ML 기반 게임 매칭

기존 방식의 문제점: **단순 승/패 집계**는 *왜* 졌는지 알려주지 않는다.

새 원칙:
1. **해당 상황이 실제로 발생한 게임을 정확히 탐지**한다 — PGN + python-chess 로 구조적 조건 검사
2. **Stockfish 평가값을 수 단위로 적용**해 해당 수가 실수인지 최선인지 판별한다
3. **ML 모델의 출력은 이진 결과(승/패)가 아닌 패턴 점수 또는 확률**이다
4. **매칭된 게임 URL을 결과에 포함**해 사용자가 직접 복기할 수 있게 한다

---

## 2. 상황별 설계

### 카테고리 A — 전술적 취약점

---

#### [상황 1] 핀(Pin) 인지 오류

**탐지 조건 (게임 매칭 기준)**
- python-chess로 수를 순회하며, 이동하는 기물이 현재 보드에서 **절대 핀(king to attacker line)** 상태인지 검사
- 핀 상태에서 해당 기물을 움직인 수가 존재하는 게임만 대상
- Stockfish 평가: 이동 전후 cp_loss ≥ 150 이면 "핀 실수"로 확정

**피처 (수 단위)**
- `is_abs_pin`: 이동 기물이 킹→공격자 라인에 있는가 (python-chess `is_pinned()`)
- `cp_loss`: Stockfish 수 전후 평가값 차이
- `remaining_time_ratio`: 잔여 시간 / 초기 시간
- `move_number`: 수 번호 (오프닝/미들게임/엔드게임 구분)

**ML 모델**
- Logistic Regression: 핀 상황 발생 시 실수로 이어질 확률 예측
- 출력: `pin_blunder_probability` (0~1)

**결과 지표**
- 핀이 형성된 국면 수 대비 실수 수 비율 (`pin_error_rate`)
- 해당 게임의 Chess.com 분석 링크 포함

---

#### [상황 2] 포크(Fork) / 스큐어(Skewer) 노출

**탐지 조건**
- 상대가 나이트 포크 혹은 룩/비숍 스큐어를 시전한 직전 2수 이내에 내가 기물을 그 패턴에 노출시킨 경우
- 탐지 방법: 상대 수 직전 보드에서 나의 기물 배치가 나이트 이동 1수로 두 개 이상의 고가치 기물을 동시 공격 가능한 칸에 있는지 확인

**피처**
- `pieces_under_fork_threat`: 포크 가능 기물 수 (0, 1, 2+)
- `material_diff_before`: 수 전 기물 가치 차이
- `was_avoidable`: 단순 후퇴 수로 포크 회피 가능 여부 (다음 수 탐색)

**ML 모델**
- K-Means 클러스터링: 포크에 자주 당하는 포지션 유형 군집화 (k=5)
- 클러스터 레이블: `exposed / cautious / pressured / balanced / collapsed`

**결과 지표**
- 포크 노출 빈도 (게임당 평균), 클러스터 분포, 주요 취약 기물 조합

---

#### [상황 3] 희생(Sacrifice) 정확도

**탐지 조건**
- 내가 둔 수에서 기물 가치 손실이 발생하되 (캡처되거나 가치 낮은 기물로 교환),
  Stockfish 평가가 수 이전 대비 ≤ +50cp 이내로 유지되거나 상승하면 "전략적 희생"으로 분류
- 기물 가치 손실 기준: 마이너 피스(≥300cp) 또는 룩(=500cp) 이상 희생

**피처**
- `sacrifice_cp_gain`: 희생 직후 Stockfish 평가 변화
- `subsequent_accuracy`: 희생 후 5수 이내 평균 cp_loss
- `king_safety_delta`: 희생 전후 상대 킹 안전도 변화

**ML 모델**
- Logistic Regression: 희생이 "탁월"로 이어질 확률 예측
- 출력: `sacrifice_success_prob`

**결과 지표**
- 희생 시도 수, 성공률, 희생 후 평균 정확도

---

### 카테고리 B — 시간 관리 및 심리

---

#### [상황 4] 시간 압박(Time Trouble) 블런더

**탐지 조건**
- PGN `[%clk]` 어노테이션에서 잔여 시간 파싱
- 잔여 시간이 **초기 시간의 10% 미만 또는 절대값 30초 미만** 인 수에서 cp_loss ≥ 150이면 탐지

**피처**
- `remaining_sec`: 해당 수의 잔여 시간
- `time_ratio`: 잔여 / 초기
- `cp_loss`: Stockfish 평가 손실
- `phase`: 오프닝(1-15수) / 미들게임(16-35수) / 엔드게임(36수~)

**ML 모델**
- Ridge Regression: 잔여 시간 → 블런더 확률 곡선 피팅
- 출력: `blunder_prob_by_time` (시간 함수)

**결과 지표**
- 시간 압박 구간 블런더율, 시간대별 정확도 곡선, 해당 게임 목록

---

#### [상황 5] 틸트(Tilt) 상태 감지

**탐지 조건**
- 직전 게임이 "역전패" (Stockfish +2.0 이상에서 패배) 인 경우
- 다음 게임의 **첫 10수 이내** 평균 cp_loss 를 계산
- 직전 역전패 없는 게임의 첫 10수 평균 cp_loss와 비교해 유의미하게 높으면 "틸트 상태"로 분류

**피처**
- `prev_game_was_comeback_loss`: 이진 플래그
- `early_avg_cp_loss`: 현재 게임 1-10수 평균 손실
- `prev_cp_loss_10`: 직전 게임 1-10수 평균 손실 (베이스라인)

**ML 모델**
- Logistic Regression: 틸트 상태 이진 분류
- 임계값: `early_avg_cp_loss` 가 베이스라인의 1.5배 이상

**결과 지표**
- 틸트 탐지 게임 수, 틸트 시 평균 정확도, 틸트 → 정상 회복 소요 수 수

---

#### [상황 6] 크리티컬 포지션 시간 투자

**탐지 조건**
- Stockfish 평가가 연속 2수 사이에 ±100cp 이상 급변하는 구간을 "크리티컬 포지션"으로 정의
- 해당 수에서의 소비 시간(`[%emt]`)을 측정

**피처**
- `eval_swing`: 평가값 변화폭 (절댓값)
- `time_spent_sec`: 해당 수 소비 시간
- `result_cp_loss`: 실제 선택한 수의 cp_loss

**ML 모델**
- 산점도 + Pearson 상관분석: 소비 시간 ↔ cp_loss 상관관계 측정
- 출력: `critical_time_efficiency_score`

---

### 카테고리 C — 오프닝 및 포지션

---

#### [상황 7] 반대 방향 캐슬링 난전

**탐지 조건**
- 게임 PGN에서 백과 흑의 캐슬링 방향을 파싱 (`O-O` vs `O-O-O`)
- 양측이 반대 방향으로 캐슬링한 게임만 대상
- 캐슬링 완료 후 20수 이내 평균 cp_loss를 지표로 사용

**피처**
- `opp_castling_side`: 상대 캐슬링 방향
- `pawn_advance_aggression`: 캐슬링 후 5수 이내 킹 쪽 폰 전진 수
- `accuracy_post_castle_20`: 캐슬링 후 20수 정확도

**ML 모델**
- Logistic Regression: 반대 캐슬링 상황에서 20수 이내 패배 확률 예측

**결과 지표**
- 반대 캐슬링 게임 수, 승/무/패 비율, 주요 패인 수 번호 분포

---

#### [상황 8] 오프닝 이론 이탈(Out of Book) 후 성적

**탐지 조건**
- ECO 코드 기준 알려진 오프닝 변형의 최대 이론 수 이후 첫 번째 새 수를 "이탈 수"로 정의
- `opening_db.py` 의 opening_db 내 수순과 PGN을 비교해 이탈 지점 감지
- 이탈 후 5수 이내 Stockfish 평가값 변화를 측정

**피처**
- `out_of_book_move_number`: 이탈 발생 수 번호
- `cp_loss_5_after_book`: 이탈 후 5수 평균 cp_loss
- `eval_at_deviation`: 이탈 시점 Stockfish 평가값

**ML 모델**
- Ridge Regression: 이탈 시점 평가값 → 이탈 후 5수 평균 cp_loss 예측
- 출력: 오프닝별 "이탈 후 이해도 점수"

---

#### [상황 9] 엔드게임 전환 능력

**탐지 조건**
- 남은 기물 총 가치가 양측 합산 ≤ 1300cp (룩·나이트·비숍 각 1개 미만 수준)이 되는 시점부터 엔드게임으로 정의
- 엔드게임 진입 시 Stockfish 평가가 내가 유리(≥+100cp)인 게임과 불리(≤-100cp)인 게임 분리 분석

**피처**
- `endgame_entry_eval`: 엔드게임 진입 시 평가값
- `avg_cp_loss_endgame`: 엔드게임 구간 평균 cp_loss
- `endgame_phase_accuracy`: 엔드게임 수 정확도

**ML 모델**
- KNN 분류: 엔드게임 패턴을 "활용(Conversion) / 무승부 유도(Fort) / 붕괴(Collapse)" 3클래스로 분류

---

#### [상황 10] 폰 구조 선호도 클러스터링

**탐지 조건**
- 미들게임(16-35수) 구간 보드에서 IQP, 더블폰, 패스트폰, 사슬(chain) 여부를 python-chess로 감지
- 폰 구조 피처를 게임별로 수집해 군집화

**피처**
- `has_iqp`: 고립 퀸 폰 보유 여부
- `doubled_pawns`: 더블폰 수
- `passed_pawns`: 패스트폰 수
- `pawn_chain_length`: 가장 긴 폰 체인 길이
- `space_score`: 상대 캠프 내 내 폰 수 (공간 우위 지표)

**ML 모델**
- K-Means (k=4): 폰 구조 유형 군집화
- 클러스터별 평균 cp_loss, 승률 비교

---

### 카테고리 D — 상대 상호작용

---

#### [상황 11] 블런더 응징 능력

**탐지 조건**
- Stockfish로 상대 수의 cp_loss ≥ 200 인 수(상대 블런더)를 탐지
- 해당 블런더 직후 내 수가 "블런더를 활용하는 최선수"인지 확인 (내 수 cp_loss < 50)

**피처**
- `opponent_blunder_cp`: 상대 블런더의 cp_loss 크기
- `did_punish`: 내가 최선수로 응징했는가 (이진)
- `eval_before_opp_blunder`: 상대 블런더 직전 평가값

**ML 모델**
- 단순 통계: 응징 성공률 (`punish_rate`) 집계
- XGBoost 분류: 응징 성공 여부 예측 (피처: 평가값, 시간, 수 번호)

**결과 지표**
- 상대 블런더 탐지 수, 응징 성공률, 응징 실패 게임 URL

---

#### [상황 12] 즉각 반응(Insta-move) 패턴

**탐지 조건**
- `[%emt]` 어노테이션에서 소비 시간이 **3초 이하**인 수를 "즉각 반응"으로 정의
- 즉각 반응 수의 cp_loss 와 일반 수의 cp_loss 를 비교

**피처**
- `is_insta_move`: 3초 이하 이진 플래그
- `cp_loss`: Stockfish 손실
- `move_phase`: 오프닝/미들게임/엔드게임

**ML 모델**
- t-검정: 즉각 반응 수 vs 일반 수의 cp_loss 분포 차이 검증
- 출력: `insta_blunder_rate`, `insta_vs_normal_accuracy_gap`

---

### 카테고리 E — 방어 및 복잡도

---

#### [상황 13] 방어 능력(Defensive Resilience)

**탐지 조건**
- Stockfish 평가가 **-200cp 이하**인 구간이 5수 이상 지속되는 게임만 대상
- 해당 구간에서 블런더(cp_loss ≥ 150) 없이 버텨낸 수 비율을 측정

**피처**
- `losing_dur_moves`: 불리 구간 지속 수 수
- `blunder_rate_in_losing`: 불리 구간 블런더 비율
- `final_result`: 결국 무승부 혹은 역전 여부

**결과 지표**
- 방어 생존율 (`defense_hold_rate`), 불리 → 무승부 전환 게임 URL

---

#### [상황 14] 포지션 복잡도 대처

**탐지 조건**
- 복잡도 점수 = 공격받는 기물 수 × 합법 수 개수 / 10 (python-chess `legal_moves`)
- 복잡도 상위 20% 구간에서의 평균 cp_loss를 하위 20%와 비교

**피처**
- `complexity_score`: 위 공식
- `cp_loss_at_complexity`: 해당 수의 Stockfish 손실
- `legal_move_count`: 합법 수 개수

**ML 모델**
- Random Forest: 복잡도 점수 → cp_loss 예측 (비선형 관계 포착)

---

## 3. ML 스택 요약

| 레이어 | 도구 | 용도 |
|--------|------|------|
| PGN 파싱 | `python-chess` | 보드 구조, 핀/포크/캐슬링 탐지 |
| 엔진 평가 | `Stockfish 18` (depth=8) | cp_loss, 최선수 비교 |
| 피처 정형화 | `pandas`, `NumPy` | 수 단위 피처 테이블 생성 |
| 분류 | `scikit-learn` LogReg, `XGBoost` | 블런더 확률, 패턴 분류 |
| 클러스터링 | `scikit-learn` K-Means | 포지션 유형 군집화 |
| 회귀 | `scikit-learn` Ridge / Random Forest | 시간·복잡도 → 정확도 곡선 |
| 통계 검정 | `scipy.stats` | 즉각 반응 유의성 검정 |

## 4. 출력 형식

각 상황 분석 결과는 다음 구조로 반환한다:

```json
{
  "pattern_id": "situation_4_time_pressure",
  "score": 0.73,              // 패턴 점수 (0~1, 1이 강점)
  "total_matching_games": 42, // 해당 상황이 탐지된 게임 수
  "sample_games": [           // 대표 사례 (최대 5개)
    {
      "game_url": "https://www.chess.com/game/live/...",
      "trigger_move": 34,
      "cp_loss": 320,
      "remaining_time": 18
    }
  ],
  "interpretation": "..."     // 한국어 요약 문장
}
```

