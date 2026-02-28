"""
게임 데이터 분석 서비스 — Pandas 기반 통계 처리
"""
import pandas as pd
from typing import List, Optional
from app.models.schemas import GameSummary, OpeningStats, PerformanceSummary, Platform
from app.services import opening_db
from app.services.pgn_parser import ParsedGame, MoveData


class AnalysisService:
    def build_dataframe(self, games: List[GameSummary]) -> pd.DataFrame:
        """GameSummary 리스트를 Pandas DataFrame으로 변환"""
        rows = []
        for g in games:
            rows.append({
                "game_id": g.game_id,
                "platform": g.platform.value,
                "white": g.white,
                "black": g.black,
                "result": g.result.value,
                "time_class": g.time_class,
                "opening_eco": g.opening_eco or "Unknown",
                "opening_name": g.opening_name or "Unknown",
                "played_at": g.played_at,
            })
        return pd.DataFrame(rows)

    def get_performance_summary(
        self,
        username: str,
        platform: Platform,
        games: List[GameSummary],
        time_class: str = "blitz",
    ) -> PerformanceSummary:
        """전체 퍼포먼스 요약 통계"""
        df = self.build_dataframe(games)
        if not df.empty:
            df = df[df["time_class"] == time_class]

        total = len(df)
        wins = len(df[df["result"] == "win"]) if total else 0
        losses = len(df[df["result"] == "loss"]) if total else 0
        draws = len(df[df["result"] == "draw"]) if total else 0
        win_rate = round(wins / total * 100, 1) if total else 0.0

        top_openings = self.get_opening_stats(df, top_n=5)

        return PerformanceSummary(
            username=username,
            platform=platform,
            time_class=time_class,
            total_games=total,
            wins=wins,
            losses=losses,
            draws=draws,
            win_rate=win_rate,
            top_openings=top_openings,
        )

    def get_opening_stats(
        self, df: pd.DataFrame, top_n: int = 10
    ) -> List[OpeningStats]:
        """오프닝별 통계 (상위 N개)"""
        if df.empty:
            return []

        grouped = (
            df.groupby(["opening_eco", "opening_name"])["result"]
            .value_counts()
            .unstack(fill_value=0)
            .reset_index()
        )

        result_list = []
        for _, row in grouped.iterrows():
            wins = row.get("win", 0)
            losses = row.get("loss", 0)
            draws = row.get("draw", 0)
            total = wins + losses + draws
            if total == 0:
                continue
            result_list.append(
                OpeningStats(
                    eco=row["opening_eco"],
                    name=row["opening_name"],
                    games=total,
                    wins=wins,
                    losses=losses,
                    draws=draws,
                    win_rate=round(wins / total * 100, 1),
                )
            )

        # 가장 많이 플레이한 오프닝 순 정렬
        result_list.sort(key=lambda x: x.games, reverse=True)
        return result_list[:top_n]

    def get_result_trend(self, df: pd.DataFrame) -> List[dict]:
        """시간순 승/패/무 트렌드 (프론트 차트용)"""
        if df.empty:
            return []
        trend = (
            df.sort_values("played_at")
            .assign(
                win=lambda x: (x["result"] == "win").astype(int),
                loss=lambda x: (x["result"] == "loss").astype(int),
                draw=lambda x: (x["result"] == "draw").astype(int),
            )[["played_at", "win", "loss", "draw"]]
            .to_dict(orient="records")
        )
        return trend

    def get_first_move_stats(self, df: pd.DataFrame, username: str) -> dict:
        """
        MVP 섹션 1: 백/흑 첫 수 선호도 및 승률
        ECO 코드의 첫 글자를 활용하거나 opening_name에서 첫 수를 추론
        """
        if df.empty:
            return {"white": [], "black": []}

        # ECO 카테고리로 첫 수 근사
        # A/B = 1.d4 계열 or 기타, C/D = 1.e4, E = 1.d4 인디언
        eco_to_first_move = {
            "A": "d4/c4/Nf3", "B": "e4", "C": "e4",
            "D": "d4", "E": "d4",
        }
        white_rows = df[df["white"].str.lower() == username].copy() if "white" in df.columns else pd.DataFrame()
        black_rows = df[df["black"].str.lower() == username].copy() if "black" in df.columns else pd.DataFrame()

        def opening_group_stats(subset: pd.DataFrame, top_n: int = 5) -> List[dict]:
            if subset.empty:
                return []
            grouped = subset.groupby("opening_eco")["result"].value_counts().unstack(fill_value=0).reset_index()
            result = []
            for _, row in grouped.iterrows():
                eco = row["opening_eco"]
                wins = int(row.get("win", 0))
                losses = int(row.get("loss", 0))
                draws = int(row.get("draw", 0))
                total = wins + losses + draws
                if total < 3:
                    continue
                first_letter = eco[0] if eco and eco != "Unknown" else "?"
                result.append({
                    "eco": eco,
                    "first_move_category": eco_to_first_move.get(first_letter, "Other"),
                    "games": total,
                    "wins": wins,
                    "losses": losses,
                    "draws": draws,
                    "win_rate": round(wins / total * 100, 1),
                })
            result.sort(key=lambda x: x["games"], reverse=True)
            return result[:top_n]

        return {
            "white": opening_group_stats(white_rows),
            "black": opening_group_stats(black_rows),
        }

    def get_opening_tree(self, df: pd.DataFrame, depth: int = 3) -> List[dict]:
        """
        MVP 섹션 2-A: 오프닝 트리 — ECO 계층 구조
        ECO 코드 첫 글자 → 알파벳 계열로 그룹핑 후 상위 15개 ECO 코드 세부 표시
        """
        if df.empty:
            return []

        # ── Level 1: ECO 계열 (A/B/C/D/E) ────────────────────────
        family_tree: dict[str, dict] = {}
        for _, row in df.iterrows():
            eco = row.get("opening_eco", "?") or "?"
            name = row.get("opening_name", "Unknown") or "Unknown"
            result = row.get("result", "draw")

            prefix = eco[0] if eco not in ("?", "") else "?"
            fname = opening_db.ECO_FAMILY_NAMES.get(prefix, f"{prefix} — 기타")

            if prefix not in family_tree:
                family_tree[prefix] = {
                    "eco_prefix": prefix,
                    "name": fname,
                    "games": 0, "wins": 0, "losses": 0, "draws": 0,
                    "children": {},
                }
            node = family_tree[prefix]
            node["games"] += 1
            if result == "win":
                node["wins"] += 1
            elif result == "loss":
                node["losses"] += 1
            else:
                node["draws"] += 1

            # Level 2: 3자리 ECO (e.g., B12)
            eco3 = eco[:3] if len(eco) >= 3 else eco
            child = node["children"]
            if eco3 not in child:
                # opening_db에서 표준 이름 조회, 없으면 게임 내 이름 사용
                db_name = opening_db.get_name_by_eco(eco3) or name
                child[eco3] = {
                    "eco_prefix": eco3,
                    "name": db_name,
                    "games": 0, "wins": 0, "losses": 0, "draws": 0,
                }
            child[eco3]["games"] += 1
            if result == "win":
                child[eco3]["wins"] += 1
            elif result == "loss":
                child[eco3]["losses"] += 1
            else:
                child[eco3]["draws"] += 1

        # ── 직렬화 ────────────────────────────────────────────────
        result_list = []
        for prefix, node in sorted(family_tree.items(), key=lambda x: x[1]["games"], reverse=True):
            total = node["games"]
            children_sorted = sorted(
                node["children"].values(), key=lambda c: c["games"], reverse=True
            )[:8]
            result_list.append({
                "eco_prefix": node["eco_prefix"],
                "name": node["name"],
                "games": total,
                "wins": node["wins"],
                "losses": node["losses"],
                "draws": node["draws"],
                "win_rate": round(node["wins"] / total * 100, 1) if total else 0,
                "children": [
                    {
                        "eco_prefix": c["eco_prefix"],
                        "name": c["name"],
                        "games": c["games"],
                        "wins": c["wins"],
                        "losses": c["losses"],
                        "draws": c["draws"],
                        "win_rate": round(c["wins"] / c["games"] * 100, 1) if c["games"] else 0,
                    }
                    for c in children_sorted
                ],
            })
        return result_list

    def get_best_worst_openings(
        self, df: pd.DataFrame, min_games: int = 5
    ) -> dict:
        """
        MVP 섹션 2-B: 베스트/워스트 오프닝 요약
        """
        if df.empty:
            return {"best": None, "worst": None, "all": []}

        stats = self.get_opening_stats(df, top_n=50)
        qualified = [s for s in stats if s.games >= min_games]
        if not qualified:
            return {"best": None, "worst": None, "all": stats[:10]}

        best = max(qualified, key=lambda x: x.win_rate)
        worst = min(qualified, key=lambda x: x.win_rate)

        return {
            "best": {
                "eco": best.eco,
                "name": best.name,
                "win_rate": best.win_rate,
                "games": best.games,
            },
            "worst": {
                "eco": worst.eco,
                "name": worst.name,
                "win_rate": worst.win_rate,
                "games": worst.games,
            },
            "all": [
                {
                    "eco": s.eco,
                    "name": s.name,
                    "games": s.games,
                    "win_rate": s.win_rate,
                    "wins": s.wins,
                    "losses": s.losses,
                    "draws": s.draws,
                }
                for s in qualified[:10]
            ],
        }

    # ── Step 5: PGN 기반 시간 압박 분석 ─────────────────────────

    def get_time_pressure_stats(
        self,
        parsed_games: List[ParsedGame],
        username: str,
    ) -> dict:
        """
        MVP 섹션 3-A: 시간 압박 블런더 분석
        수 페이즈(opening/middlegame/endgame) × 시간 압박 여부 교차 집계.

        Returns:
        {
          "total_games": int,
          "games_with_clock": int,
          "overall": {
            "white": { pressure_ratio, avg_time_spent, pressure_moves, total_moves },
            "black": { ... }
          },
          "by_phase": [
            {
              "phase": "opening"|"middlegame"|"endgame",
              "white_pressure_ratio": float,  # 0~1
              "black_pressure_ratio": float,
              "white_avg_time": float|null,
              "black_avg_time": float|null,
            }, ...
          ],
          "per_move": [   # 수 번호(1~40)별 평균 소비 시간 + 압박 비율
            { "move_number": int, "white_avg_time": float, "black_avg_time": float,
              "white_pressure_pct": float, "black_pressure_pct": float }, ...
          ]
        }
        """
        uname = username.lower()

        total = len(parsed_games)
        clocked = [g for g in parsed_games
                   if any(m.clock_after is not None for m in g.moves)]

        if not clocked:
            return {
                "total_games": total,
                "games_with_clock": 0,
                "overall": {},
                "by_phase": [],
                "per_move": [],
            }

        # 각 게임에서 '플레이어가 백인지 흑인지' 판단
        def _my_color(g: ParsedGame) -> Optional[str]:
            if g.white.lower() == uname:
                return "white"
            if g.black.lower() == uname:
                return "black"
            return None   # 둘 다 아닌 경우(상대방 분석 시) None → 생략

        # 수 레코드 평탄화
        rows: list[dict] = []
        for g in clocked:
            my_color = _my_color(g)
            for m in g.moves:
                if m.clock_after is None:
                    continue
                is_mine = (my_color == m.color) if my_color else True
                rows.append({
                    "game_id": g.game_id,
                    "color": m.color,
                    "is_mine": is_mine,
                    "move_number": m.move_number,
                    "phase": m.phase,
                    "clock_after": m.clock_after,
                    "time_spent": m.time_spent,
                    "is_pressure": m.is_time_pressure,
                })

        if not rows:
            return {"total_games": total, "games_with_clock": 0,
                    "overall": {}, "by_phase": [], "per_move": []}

        df = pd.DataFrame(rows)
        my_df = df[df["is_mine"]] if uname else df

        # ── Overall ──────────────────────────────────────────────
        def _summarise(sub: pd.DataFrame) -> dict:
            if sub.empty:
                return {}
            n = len(sub)
            p = sub["is_pressure"].sum()
            times = sub["time_spent"].dropna()
            return {
                "total_moves": int(n),
                "pressure_moves": int(p),
                "pressure_ratio": round(float(p / n), 4) if n else 0.0,
                "avg_time_spent": round(float(times.mean()), 2) if len(times) else None,
            }

        overall: dict = {}
        if uname:
            # 플레이어 색 무관하게 '내 수' 기준
            overall["mine"] = _summarise(my_df)
        else:
            overall["white"] = _summarise(df[df["color"] == "white"])
            overall["black"] = _summarise(df[df["color"] == "black"])

        # ── By Phase ─────────────────────────────────────────────
        by_phase = []
        for phase in ["opening", "middlegame", "endgame"]:
            ph_df = my_df[my_df["phase"] == phase] if uname else df[df["phase"] == phase]
            if ph_df.empty:
                continue
            n = len(ph_df)
            p = ph_df["is_pressure"].sum()
            times = ph_df["time_spent"].dropna()
            by_phase.append({
                "phase": phase,
                "moves": int(n),
                "pressure_moves": int(p),
                "pressure_ratio": round(float(p / n), 4) if n else 0.0,
                "avg_time_spent": round(float(times.mean()), 2) if len(times) else None,
            })

        # ── Per Move (수 번호 1~40, 이후 생략) ────────────────────
        per_move: list[dict] = []
        for mn in range(1, 41):
            mn_df = my_df[my_df["move_number"] == mn] if uname else df[df["move_number"] == mn]
            if mn_df.empty:
                continue
            n = len(mn_df)
            p = mn_df["is_pressure"].sum()
            times = mn_df["time_spent"].dropna()
            per_move.append({
                "move_number": mn,
                "games": int(n),
                "pressure_pct": round(float(p / n * 100), 1) if n else 0.0,
                "avg_time_spent": round(float(times.mean()), 2) if len(times) else None,
            })

        return {
            "total_games": total,
            "games_with_clock": len(clocked),
            "overall": overall,
            "by_phase": by_phase,
            "per_move": per_move,
        }
