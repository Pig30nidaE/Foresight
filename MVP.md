
### 🧠 ML로 분석하기 좋은 체스 상황 20가지

**[ 시간 및 심리적 흐름 (Time & Psychology) ]**

1. **Time Trouble:** 남은 시간이 1분(또는 전체 시간의 10%) 미만일 때 급격히 증가하는 Blunder 비율.
2. **Instant Response:** 상대가 수를 둔 후 3초 이내에 직관적으로 즉각 반응했을 때 실수하는 빈도.
3. **Tilt (연패 심리):** 이전 게임을 역전패당한 후, 다음 게임 초반(10수 이내)에 나타나는 집중력 저하 및 실수 비율.
4. **Advantage Throw:** 엔진 평가값이 +3 이상으로 매우 유리한 상황에서 치명적인 Blunder 를 두어 역전당하는 패턴.
5. **Mutual Blunder:** 상대가 Blunder 를 둔 직후, 이를 정확히 응징하지 못하고 덩달아 실수하는 경우.
6. **Time Advantage:** 시간은 넉넉하지만 포지션이 불리할 때, 시간을 충분히 소모하여 위기를 탈출하는 Best Move 탐색 끈기.

**[ 전술적 모티프 인지 능력 (Tactical Motifs) ]**
7. **Pin (핀):** 내 기물이 Pin 에 걸려 움직일 수 없을 때 무리하게 움직이거나, 상대의 Pin 을 인지하지 못하는 실수.
8. **Fork (포크):** 나이트나 폰에 의한 다중 공격(Fork) 위협을 사전에 인지하고 회피하는 비율.
9. **Discovered Attack:** 숨겨져 있던 공격 경로가 열릴 때 이를 놓치거나 간과하는 빈도.
10. **Back-Rank Mate:** 킹의 퇴로가 폰에 막혀있는 8랭크/1랭크 수비 취약성 파악.
11. **Zwischenzug (사이수):** 뻔해 보이는 기물 교환 상황 중간에 끼워넣는 전술적 수(In-between move)를 찾아내는 능력.

**[ 포지션 및 기물 상황 (Positional & Material Context) ]**
12. **Sacrifice (희생):** Greek Gift 등 기물 희생 이후 후속 공격의 정확도 (Brilliant 창출 비율).
13. **Closed Position:** 폰 구조가 단단히 닫혀 기동성이 떨어질 때, 무리한 수를 두어 균형을 깨뜨리는 빈도.
14. **Opposite-side Castling:** 서로 반대 방향으로 캐슬링하여 Pawn Storm 이 발생하는 복잡한 난전 상황에서의 수 품질.
15. **Isolated Queen's Pawn:** 고립된 퀸 폰(IQP) 구조를 가졌을 때의 공수 밸런스와 엔드게임 승률.
16. **Bishop Pair:** 비숍 쌍을 모두 보유한 상태에서 보드를 넓게 쓰며 이점을 살리는 Best Move 탐색 비율.

**[ 복잡도 및 전환점 (Complexity & Transitions) ]**
17. **High Tension:** 3개 이상의 기물이 서로 공격/방어 상태로 얽혀있는 '높은 긴장도' 상황에서의 계산 착오.
18. **Queen Exchange:** 퀸이 교환되며 본격적인 엔드게임으로 전환되는 시점의 포지션 이해도 및 실수.
19. **Pawn Promotion Race:** 양측이 폰을 승급시키기 위해 아슬아슬하게 경쟁하는 상황에서의 수읽기 정확도.
20. **King Hunt:** 상대 킹이 캐슬링 진영 밖으로 끌려나왔을 때 정확하게 Mate 를 찾아내어 게임을 끝내는 능력.

---

### 🛠️ 추천 ML 기술 스택 및 라이브러리

기존에 구상하신 **Python** , **FastAPI** , **Pandas** , **Scikit-learn** 을 기반으로 하되, 체스 도메인에 특화된 라이브러리와 예측력이 뛰어난 모델을 추가하는 것을 추천합니다.

* **python-chess** : PGN을 파싱하고, 보드 상태에서 Pin, Fork, 캐슬링 권한, 기물 간의 Tension 등의 Feature 를 추출하는 데 절대적으로 필요한 핵심 라이브러리입니다.
* **Stockfish** (엔진): **python-chess** 와 연동하여 보드의 Centipawn 평가값을 도출합니다. 이 평가값의 변화량을 기준으로 Blunder 와 Brilliant 를 수학적으로 라벨링할 수 있습니다.
* **Pandas** 와 **NumPy** : 추출된 체스 Feature 들을 정형화된 데이터프레임으로 변환하고 학습하기 좋게 전처리합니다.
* **Scikit-learn** 을 활용한 군집화 (Clustering): K-Means 알고리즘 등을 사용해 유저의 실수 데이터를 군집화하여 "유저의 3대 약점 패턴" 등을 대시보드에 도출할 수 있습니다.
* **XGBoost** 나 **LightGBM** (선택): 기존 스택에 추가하면 좋은 트리 기반 앙상블 모델입니다. 특정 보드 상태(Feature)와 남은 시간 정보가 주어졌을 때, 유저가 다음 수에 Blunder 를 둘 확률을 예측(Classification)하는 데 매우 뛰어난 성능을 발휘합니다.
