"""
게임 데이터 분석 서비스 — Pandas 기반 통계 처리
"""
import pandas as pd
from typing import List
from app.models.schemas import GameSummary, OpeningStats, PerformanceSummary, Platform


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
        ECO 코드 첫 글자 → 숫자 두 자리로 그룹핑
        """
        if df.empty:
            return []

        tree: dict = {}
        for _, row in df.iterrows():
            eco = row.get("opening_eco", "?") or "?"
            name = row.get("opening_name", "Unknown") or "Unknown"
            result = row.get("result", "draw")

            # Level 1: 알파벳 (A, B, C, D, E)
            l1 = eco[0] if eco != "?" else "?"
            # Level 2: ECO 두 자리 (e.g., B20)
            l2 = eco[:3] if len(eco) >= 3 else eco
            # Level 3: 전체 ECO
            l3 = eco

            for level_key, level_name in [(l1, l1), (l2, l2), (l3, name)]:
                if level_key not in tree:
                    tree[level_key] = {"key": level_key, "name": level_name, "games": 0, "wins": 0, "losses": 0, "draws": 0, "children": {}}
                tree[level_key]["games"] += 1
                if result == "win":
                    tree[level_key]["wins"] += 1
                elif result == "loss":
                    tree[level_key]["losses"] += 1
                else:
                    tree[level_key]["draws"] += 1
                break  # 최상위 레벨만 집계

        result_list = []
        for key, node in sorted(tree.items(), key=lambda x: x[1]["games"], reverse=True)[:15]:
            total = node["games"]
            result_list.append({
                "eco_prefix": node["key"],
                "name": node["name"],
                "games": total,
                "wins": node["wins"],
                "losses": node["losses"],
                "draws": node["draws"],
                "win_rate": round(node["wins"] / total * 100, 1) if total else 0,
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
