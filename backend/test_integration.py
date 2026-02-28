"""
Step 4 통합 테스트: any_hogs Chess.com 데이터 E2E 검증
사용법: python test_integration.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.chessdotcom import ChessDotComService
from app.services.analysis import AnalysisService

USERNAME = "any_hogs"


async def main():
    chessdotcom = ChessDotComService()
    analysis = AnalysisService()

    print("=" * 60)
    print(f"  Foresight — Step 4 통합 테스트: {USERNAME}")
    print("=" * 60)

    # ── 1. 프로필 ──────────────────────────────────────────────
    print("\n[1] 프로필 조회...")
    profile = await chessdotcom.get_player_profile(USERNAME)
    print(f"  username : {profile.username}")
    print(f"  platform : {profile.platform}")
    print(f"  Bullet   : {profile.rating_bullet}")
    print(f"  Blitz    : {profile.rating_blitz}")
    print(f"  Rapid    : {profile.rating_rapid}")
    print(f"  Country  : {profile.country}")
    assert profile.username == USERNAME, "유저명 불일치"
    print("  ✅ OK")

    # ── 2. 최근 게임 50게임 ────────────────────────────────────
    print("\n[2] 최근 게임 50게임 조회...")
    games = await chessdotcom.get_recent_games(USERNAME, max_games=50)
    print(f"  가져온 게임 수 : {len(games)}")
    assert len(games) > 0, "게임 없음"
    g = games[0]
    print(f"  최신 게임 예시:")
    print(f"    game_id   : {g.game_id[:40]}...")
    print(f"    white     : {g.white}")
    print(f"    black     : {g.black}")
    print(f"    result    : {g.result}")
    print(f"    time_class: {g.time_class}")
    print(f"    eco       : {g.opening_eco}")
    print(f"    opening   : {g.opening_name}")
    print(f"    played_at : {g.played_at}")
    assert g.opening_eco is not None, "ECO 코드 없음 — PGN 파싱 실패"
    print("  ✅ OK")

    # ── 3. time_class 분포 ─────────────────────────────────────
    print("\n[3] time_class 분포 확인...")
    from collections import Counter
    tc_dist = Counter(g.time_class for g in games)
    for tc, cnt in tc_dist.most_common():
        print(f"  {tc:12s}: {cnt}게임")
    print("  ✅ OK")

    # ── 4. 퍼포먼스 요약 (bullet) ──────────────────────────────
    print("\n[4] Bullet 퍼포먼스 요약...")
    bullet_games = [g for g in games if g.time_class == "bullet"]
    if bullet_games:
        from app.models.schemas import Platform
        perf = analysis.get_performance_summary(USERNAME, Platform.chessdotcom, bullet_games, "bullet")
        print(f"  총 게임    : {perf.total_games}")
        print(f"  승/무/패   : {perf.wins}/{perf.draws}/{perf.losses}")
        print(f"  승률       : {perf.win_rate}%")
        top = perf.top_openings[:3]
        if top:
            print(f"  Top 오프닝 (상위 3):")
            for op in top:
                print(f"    [{op.eco}] {op.name} — {op.games}게임, {op.win_rate}% 승률")
    print("  ✅ OK")

    # ── 5. 첫 수 선호도 ────────────────────────────────────────
    print("\n[5] 첫 수 선호도 (백/흑)...")
    df = analysis.build_dataframe(games)
    df_bullet = df[df["time_class"] == "bullet"] if not df.empty else df
    first_moves = analysis.get_first_move_stats(df_bullet, USERNAME.lower())
    white_moves = first_moves.get("white", [])
    black_moves = first_moves.get("black", [])
    print(f"  백 오프닝 계열 수: {len(white_moves)}")
    for m in white_moves[:3]:
        print(f"    ECO {m['eco']}: {m['games']}게임, 승률 {m['win_rate']}%")
    print(f"  흑 오프닝 계열 수: {len(black_moves)}")
    for m in black_moves[:3]:
        print(f"    ECO {m['eco']}: {m['games']}게임, 승률 {m['win_rate']}%")
    print("  ✅ OK")

    # ── 6. Best/Worst 오프닝 ───────────────────────────────────
    print("\n[6] Best/Worst 오프닝...")
    bw = analysis.get_best_worst_openings(df_bullet, min_games=2)
    if bw["best"]:
        print(f"  🏆 Best : [{bw['best']['eco']}] {bw['best']['name']} — {bw['best']['win_rate']}%")
    if bw["worst"]:
        print(f"  ⚠️  Worst: [{bw['worst']['eco']}] {bw['worst']['name']} — {bw['worst']['win_rate']}%")
    print("  ✅ OK")

    print("\n" + "=" * 60)
    print("  ✅ 모든 테스트 통과 — Step 4 완료")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
