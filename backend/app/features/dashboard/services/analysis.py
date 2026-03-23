"""
게임 데이터 분석 서비스 — 순수 Python 통계 처리
"""
import re
from collections import defaultdict
from typing import List, Optional
from app.models.schemas import GameSummary, OpeningStats, PerformanceSummary, Platform
from app.shared.services import opening_db
from app.shared.services.pgn_parser import ParsedGame, MoveData

# PGN 첫 수 추출용 정규식
_RE_HEADERS = re.compile(r'\[[^\]]+\]')
_RE_BRACES  = re.compile(r'\{[^}]*\}')   # {[%clk...]} 및 빈 {} 제거
_RE_MOVENUM = re.compile(r'\d+\.+')       # 1. / 1... 제거
_RESULT_TOKENS = frozenset({'*', '1-0', '0-1', '1/2-1/2'})


def _extract_first_moves(pgn: str):
    """PGN → (white_move1, black_move1) — 예) ('e4', 'c5')"""
    if not pgn:
        return None, None
    moves_part = _RE_HEADERS.sub('', pgn)
    moves_part = _RE_BRACES.sub('', moves_part)
    moves_part = _RE_MOVENUM.sub('', moves_part)
    tokens = [t for t in moves_part.split() if t not in _RESULT_TOKENS and t.strip()]
    white1 = tokens[0] if len(tokens) > 0 else None
    black1 = tokens[1] if len(tokens) > 1 else None
    return white1, black1


class AnalysisService:
    def build_rows(self, games: List[GameSummary]) -> List[dict]:
        """GameSummary 리스트를 dict 리스트로 변환"""
        rows = []
        for g in games:
            white1, black1 = _extract_first_moves(g.pgn or '')
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
                "white_move1": white1,
                "black_move1": black1,
                "url": g.url,
            })
        return rows

    def get_performance_summary(
        self,
        username: str,
        platform: Platform,
        games: List[GameSummary],
        time_class: str = "blitz",
    ) -> PerformanceSummary:
        """전체 퍼포먼스 요약 통계"""
        rows = self.build_rows(games)
        if rows:
            rows = [r for r in rows if r["time_class"] == time_class]

        total = len(rows)
        wins   = sum(1 for r in rows if r["result"] == "win")
        losses = sum(1 for r in rows if r["result"] == "loss")
        draws  = sum(1 for r in rows if r["result"] == "draw")
        win_rate = round(wins / total * 100, 1) if total else 0.0

        top_openings = self.get_opening_stats(rows, top_n=5)

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
        self, rows: List[dict], top_n: int = 10
    ) -> List[OpeningStats]:
        """오프닝별 통계 (상위 N개)"""
        if not rows:
            return []

        stats: dict = defaultdict(lambda: {"win": 0, "loss": 0, "draw": 0})
        for r in rows:
            key = (r["opening_eco"], r["opening_name"])
            result = r["result"]
            stats[key][result] = stats[key].get(result, 0) + 1

        result_list = []
        for (eco, name), counts in stats.items():
            wins   = counts.get("win",  0)
            losses = counts.get("loss", 0)
            draws  = counts.get("draw", 0)
            total  = wins + losses + draws
            if total == 0:
                continue
            result_list.append(
                OpeningStats(
                    eco=eco,
                    name=name,
                    games=total,
                    wins=wins,
                    losses=losses,
                    draws=draws,
                    win_rate=round(wins / total * 100, 1),
                )
            )

        result_list.sort(key=lambda x: x.games, reverse=True)
        return result_list[:top_n]

    def get_result_trend(self, rows: List[dict]) -> List[dict]:
        """시간순 승/패/무 트렌드 (프론트 차트용)"""
        if not rows:
            return []
        return [
            {
                "played_at": r["played_at"],
                "win":  1 if r["result"] == "win"  else 0,
                "loss": 1 if r["result"] == "loss" else 0,
                "draw": 1 if r["result"] == "draw" else 0,
            }
            for r in sorted(rows, key=lambda r: r["played_at"])
        ]

    def get_first_move_stats(self, rows: List[dict], username: str) -> dict:
        """
        섹션 1: 백/흑 첫 수 선호도 및 승률
        PGN에서 추출한 실제 첫 수(e4/d4/c4/Nf3 등)로 집계
        """
        if not rows:
            return {"white": [], "black": [], "total_games": 0}

        white_rows = [r for r in rows if r.get("white") and r["white"].lower() == username]
        black_rows = [r for r in rows if r.get("black") and r["black"].lower() == username]

        def first_move_stats(subset: List[dict], move_col: str, top_n: int = 7) -> List[dict]:
            if not subset:
                return []
            valid = [r for r in subset if r.get(move_col)]
            if not valid:
                return []

            agg: dict = defaultdict(lambda: {"win": 0, "loss": 0, "draw": 0})
            for r in valid:
                move = r[move_col]
                result = r["result"]
                agg[move][result] = agg[move].get(result, 0) + 1

            result = []
            for move, counts in agg.items():
                wins   = int(counts.get("win",  0))
                losses = int(counts.get("loss", 0))
                draws  = int(counts.get("draw", 0))
                total  = wins + losses + draws
                if total < 5:
                    continue
                result.append({
                    "eco": move,
                    "first_move_category": move,
                    "games": total,
                    "wins":   wins,
                    "losses": losses,
                    "draws":  draws,
                    "win_rate": round(wins / total * 100, 1),
                })
            result.sort(key=lambda x: x["games"], reverse=True)
            return result[:top_n]

        return {
            "white": first_move_stats(white_rows, "white_move1"),
            "black": first_move_stats(black_rows, "black_move1"),
            "total_games": len(rows),
        }

    def get_opening_tree(self, rows: List[dict], depth: int = 3) -> List[dict]:
        """
        섹션 2-A: 오프닝 트리
        Level 1 : 오프닝 기본 이름 (콜론 앞 부분) — 예) "Caro-Kann Defense"
        Level 2 : 풀 변형명 + ECO3 코드  — 예) "Caro-Kann Defense: Advance Variation" (B12)
        """
        if not rows:
            return []

        base_tree: dict[str, dict] = {}

        for row in rows:
            eco    = row.get("opening_eco",  "") or ""
            name   = row.get("opening_name", "") or ""
            result = row.get("result", "draw")

            # 기본 오프닝명 — 콜론이 있으면 앞 부분, 없으면 전체
            if ":" in name:
                base_name = name.split(":", 1)[0].strip()
            elif name and name != "Unknown":
                base_name = name.strip()
            else:
                base_name = opening_db.get_name_by_eco(eco[:3]) if eco else "Unknown"
                if not base_name:
                    base_name = eco[:1] + "xx" if eco else "Unknown"

            eco_family = eco[0] if eco else "?"
            eco3 = eco[:3] if len(eco) >= 3 else eco

            # Level 1
            if base_name not in base_tree:
                base_tree[base_name] = {
                    "eco_prefix": eco_family,
                    "name": base_name,
                    "games": 0, "wins": 0, "losses": 0, "draws": 0,
                    "children": {},
                    "games_list": [],
                }
            node = base_tree[base_name]
            node["games"] += 1
            if result == "win":    node["wins"]   += 1
            elif result == "loss": node["losses"] += 1
            else:                  node["draws"]  += 1
            game_url = row.get("url")
            if game_url:
                node["games_list"].append({
                    "url": game_url,
                    "result": result,
                    "opening_name": name if name else base_name,
                    "played_at": row.get("played_at"),
                    "white": row.get("white"),
                    "black": row.get("black"),
                })

            # Level 2 — 풀 이름 + ECO3 를 키로 사용
            child_key = f"{eco3}:{name}" if name else eco3
            children = node["children"]
            if child_key not in children:
                children[child_key] = {
                    "eco_prefix": eco3,
                    "name": name if name else eco3,
                    "games": 0, "wins": 0, "losses": 0, "draws": 0,
                    "games_list": [],
                }
            child = children[child_key]
            child["games"] += 1
            if result == "win":    child["wins"]   += 1
            elif result == "loss": child["losses"] += 1
            else:                  child["draws"]  += 1
            if game_url:
                child["games_list"].append({
                    "url": game_url,
                    "result": result,
                    "opening_name": name if name else base_name,
                    "played_at": row.get("played_at"),
                    "white": row.get("white"),
                    "black": row.get("black"),
                })

        # 직렬화
        result_list = []
        for node in sorted(base_tree.values(), key=lambda n: n["games"], reverse=True):
            total = node["games"]
            children_sorted = sorted(
                node["children"].values(), key=lambda c: c["games"], reverse=True
            )[:10]
            result_list.append({
                "eco_prefix": node["eco_prefix"],
                "name": node["name"],
                "games": total,
                "wins": node["wins"],
                "losses": node["losses"],
                "draws": node["draws"],
                "win_rate": round(node["wins"] / total * 100, 1) if total else 0,
                "top_games": node["games_list"][:20],
                "children": [
                    {
                        "eco_prefix": c["eco_prefix"],
                        "name": c["name"],
                        "games": c["games"],
                        "wins": c["wins"],
                        "losses": c["losses"],
                        "draws": c["draws"],
                        "win_rate": round(c["wins"] / c["games"] * 100, 1) if c["games"] else 0,
                        "top_games": c["games_list"][:20],
                    }
                    for c in children_sorted
                ],
            })
        return result_list

    def get_best_worst_openings(
        self, rows: List[dict], min_games: int = 10
    ) -> dict:
        """
        MVP 섹션 2-B: 베스트/워스트 오프닝 요약

        qualified 집합이 2개 미만이면 min_games 임계값을 점진적으로 완화하여
        서로 다른 best/worst를 확보한다. 오프닝이 단 1종류뿐이면
        worst=None 을 반환해 "데이터 부족" 상태를 프론트에 정직하게 알린다.
        """
        if not rows:
            return {"best": None, "worst": None, "all": []}

        stats = self.get_opening_stats(rows, top_n=50)
        if not stats:
            return {"best": None, "worst": None, "all": []}

        qualified = [s for s in stats if s.games >= min_games]
        if len(qualified) < 2:
            for fallback in [5, 3, 1]:
                qualified = [s for s in stats if s.games >= fallback]
                if len(qualified) >= 2:
                    break

        if len(qualified) == 1:
            sole = qualified[0]
            return {
                "best": {
                    "eco": sole.eco,
                    "name": sole.name,
                    "win_rate": sole.win_rate,
                    "games": sole.games,
                },
                "worst": None,
                "all": [
                    {
                        "eco": sole.eco,
                        "name": sole.name,
                        "games": sole.games,
                        "win_rate": sole.win_rate,
                        "wins": sole.wins,
                        "losses": sole.losses,
                        "draws": sole.draws,
                    }
                ],
            }

        best  = max(qualified, key=lambda x: x.win_rate)
        rest  = [s for s in qualified if s.eco != best.eco] or qualified
        worst = min(rest, key=lambda x: x.win_rate)

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
        MVP 섹션 3-A: 시간 압박 분석
        기물 기반 페이즈 × 시간 압박 여부 교차 집계.
        Lichess move_analysis가 있으면 압박 상황에서의 엔진 판정(Blunder 등)을 함께 집계.
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

        def _my_color(g: ParsedGame) -> Optional[str]:
            if g.white.lower() == uname:
                return "white"
            if g.black.lower() == uname:
                return "black"
            return None

        # 수 레코드 평탄화
        data: list[dict] = []
        for g in clocked:
            my_color = _my_color(g)
            for m in g.moves:
                if m.clock_after is None:
                    continue
                is_mine = (my_color == m.color) if my_color else True
                data.append({
                    "game_id": g.game_id,
                    "color": m.color,
                    "is_mine": is_mine,
                    "move_number": m.move_number,
                    "phase": m.phase,
                    "clock_after": m.clock_after,
                    "time_spent": m.time_spent,
                    "is_pressure": m.is_time_pressure,
                    "judgment": m.judgment,
                })

        if not data:
            return {"total_games": total, "games_with_clock": 0,
                    "overall": {}, "by_phase": [], "per_move": []}

        my_data = [r for r in data if r["is_mine"]] if uname else data

        # ── Overall ──────────────────────────────────────────────
        def _summarise(sub: list[dict]) -> dict:
            if not sub:
                return {}
            n = len(sub)
            p = sum(1 for r in sub if r["is_pressure"])
            times = [r["time_spent"] for r in sub if r["time_spent"] is not None]
            out = {
                "total_moves": int(n),
                "pressure_moves": int(p),
                "pressure_ratio": round(p / n, 4) if n else 0.0,
                "avg_time_spent": round(sum(times) / len(times), 2) if times else None,
            }
            q = _under_pressure_quality(sub)
            if q is not None:
                out["under_pressure_quality"] = q
            return out

        def _under_pressure_quality(sub: list[dict]) -> Optional[dict]:
            """시간 압박인 수 중 Lichess 엔진 판정이 붙은 수만 집계."""
            pressure = [r for r in sub if r["is_pressure"]]
            if not pressure:
                return None
            judged = [r for r in pressure if r.get("judgment")]
            if not judged:
                return None

            def _cnt(name: str) -> int:
                return sum(1 for r in judged if r.get("judgment") == name)

            bl = _cnt("Blunder")
            mi = _cnt("Mistake")
            ia = _cnt("Inaccuracy")
            nj = len(judged)
            severe = bl + mi
            return {
                "pressure_moves": int(len(pressure)),
                "judged_moves": int(nj),
                "blunders": int(bl),
                "mistakes": int(mi),
                "inaccuracies": int(ia),
                "severe_under_pressure_ratio": round(severe / nj, 4) if nj else 0.0,
                "blunder_under_pressure_ratio": round(bl / nj, 4) if nj else 0.0,
            }

        overall: dict = {}
        if uname:
            overall["mine"] = _summarise(my_data)
        else:
            overall["white"] = _summarise([r for r in data if r["color"] == "white"])
            overall["black"] = _summarise([r for r in data if r["color"] == "black"])

        # ── By Phase ─────────────────────────────────────────────
        by_phase = []
        for phase in ["opening", "middlegame", "endgame"]:
            sub = [r for r in (my_data if uname else data) if r["phase"] == phase]
            if not sub:
                continue
            n = len(sub)
            p = sum(1 for r in sub if r["is_pressure"])
            times = [r["time_spent"] for r in sub if r["time_spent"] is not None]
            by_phase.append({
                "phase": phase,
                "moves": int(n),
                "pressure_moves": int(p),
                "pressure_ratio": round(p / n, 4) if n else 0.0,
                "avg_time_spent": round(sum(times) / len(times), 2) if times else None,
            })

        # ── Per Move (수 번호 1~40, 이후 생략) ────────────────────
        per_move: list[dict] = []
        base = my_data if uname else data
        for mn in range(1, 41):
            sub = [r for r in base if r["move_number"] == mn]
            if not sub:
                continue
            n = len(sub)
            p = sum(1 for r in sub if r["is_pressure"])
            times = [r["time_spent"] for r in sub if r["time_spent"] is not None]
            per_move.append({
                "move_number": mn,
                "games": int(n),
                "pressure_pct": round(p / n * 100, 1) if n else 0.0,
                "avg_time_spent": round(sum(times) / len(times), 2) if times else None,
            })

        return {
            "total_games": total,
            "games_with_clock": len(clocked),
            "overall": overall,
            "by_phase": by_phase,
            "per_move": per_move,
        }
