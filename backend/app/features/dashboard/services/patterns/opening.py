"""오프닝 패턴 분석 모듈"""
from typing import List, Dict, Any
from collections import defaultdict
from ...schemas import GameSummary, PatternDetail


def analyze_opening_familiarity(
    games: List[GameSummary],
    username: str
) -> PatternDetail:
    """
    주력 오프닝(자주 플레이한 오프닝)과 생소한 오프닝의 승률 차이 분석
    """
    # ECO별 게임 수 및 승률 집계
    eco_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"games": [], "wins": 0, "losses": 0, "draws": 0})
    
    for game in games:
        eco = game.eco or "UNKNOWN"
        is_user_win = game.winner == "win" if game.user_color == "white" else game.winner == "loss"
        is_user_loss = game.winner == "loss" if game.user_color == "white" else game.winner == "win"
        is_draw = game.winner == "draw"
        
        eco_stats[eco]["games"].append(game)
        if is_user_win:
            eco_stats[eco]["wins"] += 1
        elif is_user_loss:
            eco_stats[eco]["losses"] += 1
        elif is_draw:
            eco_stats[eco]["draws"] += 1
    
    # 3회 이상 플레이한 오프닝을 주력으로 간주
    main_ecos = [eco for eco, stats in eco_stats.items() if len(stats["games"]) >= 3]
    rare_ecos = [eco for eco in eco_stats.keys() if eco not in main_ecos]
    
    if not main_ecos:
        return None
    
    # 주력 오프닝 통계
    main_games = []
    main_wins = 0
    for eco in main_ecos:
        stats = eco_stats[eco]
        main_games.extend(stats["games"])
        main_wins += stats["wins"]
    main_wr = (main_wins / len(main_games) * 100) if main_games else 0
    
    # 생소한 오프닝 통계
    rare_games = []
    rare_wins = 0
    for eco in rare_ecos:
        stats = eco_stats[eco]
        rare_games.extend(stats["games"])
        rare_wins += stats["wins"]
    rare_wr = (rare_wins / len(rare_games) * 100) if rare_games else 0
    
    # 승률 차이
    diff = main_wr - rare_wr
    
    # 점수 계산 (주력 오프닝 승률 기반)
    if main_wr >= 55:
        score = 85
    elif main_wr >= 50:
        score = 70
    elif main_wr >= 45:
        score = 55
    else:
        score = 40
    
    # 대표 게임 (주력 오프닝 중 승리한 게임)
    main_sorted = sorted(
        [g for g in main_games if g.winner == "win"],
        key=lambda x: x.accuracy or 0,
        reverse=True
    )
    
    # 게임 목록 (URL 있는 것만)
    main_games_with_url = [g for g in main_sorted if g.url][:10]
    rare_games_with_url = [g for g in rare_games if g.url][:5]
    
    return PatternDetail(
        pattern_id="opening_familiarity",
        name="오프닝 친숙도",
        description="자주 플레이한 오프닝(3회+)과 생소한 오프닝의 승률 차이 분석",
        score=score,
        is_strength=diff >= 0,
        games_analyzed=len(main_games) + len(rare_games),
        detail=(f"주력 오프닝 {len(main_ecos)}개 {len(main_games)}게임 {main_wr:.0f}% | "
                f"생소 오프닝 {len(rare_games)}게임 {rare_wr:.0f}% ({diff:+.0f}%p)"),
        category="position",
        situation_id=18,
        insight=(f"주력 오프닝 {len(main_ecos)}개 {main_wr:.0f}% — "
                 f"생소 오프닝 대비 {diff:+.0f}%p. "
                 f"{'오프닝 준비 우수' if diff > 5 else ('오프닝 다양성 필요' if diff < -5 else '오프닝 성과 균형')}"),
        key_metric_value=main_wr,
        key_metric_label="주력 오프닝 승률",
        key_metric_unit="%",
        evidence_count=len(main_ecos),
        representative_games=main_sorted[:10],
    )
