import asyncio
import re
from app.services import opening_db
from app.services.analysis import AnalysisService
from app.services.chessdotcom import ChessDotComService


def pgn_first_moves(pgn: str):
    """PGN에서 백의 첫 수, 흑의 첫 수 추출"""
    moves_part = re.sub(r'\[[^\]]+\]', '', pgn).strip()
    # 클록/코멘트 제거
    moves_part = re.sub(r'\{[^}]+\}', '', moves_part)
    tokens = moves_part.split()
    moves = [t for t in tokens if not t.endswith('.') and not t.startswith('$') and t not in ('*','1-0','0-1','1/2-1/2')]
    white_first = moves[0] if len(moves) > 0 else None
    black_first = moves[1] if len(moves) > 1 else None
    return white_first, black_first


async def main():
    # 1) ECO DB 로드
    n = await opening_db.load_opening_db()
    print(f"ECO DB: {n} entries, loaded={opening_db.is_loaded()}")
    for eco in ['B12', 'D20', 'A41', 'C65', 'E97']:
        print(f"  {eco} => {opening_db.get_name_by_eco(eco)}")

    # 2) 실제 게임 첫 수
    svc = ChessDotComService()
    games = await svc.get_recent_games('any_hogs', max_games=20)
    print(f"\n=== First Moves from PGN ===")
    for g in games[:10]:
        wf, bf = pgn_first_moves(g.pgn or '')
        is_white = g.white.lower() == 'any_hogs'
        print(f"  {'WHITE' if is_white else 'BLACK'} eco={g.opening_eco} name={g.opening_name[:35]:<35}  1.white={wf}  1...black={bf}")

    # 3) opening tree 현재 상태
    a = AnalysisService()
    df = a.build_dataframe(games)
    df_b = df[df['time_class'] == 'bullet']
    tree = a.get_opening_tree(df_b, 3)
    print(f"\n=== Opening Tree ({len(tree)} families) ===")
    for node in tree[:3]:
        print(f"  {node['eco_prefix']}: {node['name']} ({node['games']}게임)")
        for child in node.get('children', [])[:4]:
            print(f"    {child['eco_prefix']}: {child['name']}")


asyncio.run(main())
