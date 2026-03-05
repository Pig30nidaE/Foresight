"""
Lichess Explorer API 단건 테스트
- 토큰 인증 확인
- 루이 로페즈 포지션(FEN) 조회
"""
import asyncio
import urllib.parse
import httpx

TOKEN = "lip_FIntI7Ng6mpE804FP4fN"

# 루이 로페즈 (1.e4 e5 2.Nf3 Nc6 3.Bb5) FEN
FEN = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"


async def test():
    fen_encoded = urllib.parse.quote(FEN, safe="")
    url = (
        f"https://explorer.lichess.org/lichess"
        f"?fen={fen_encoded}"
        f"&ratings[]=1600"
        f"&speeds[]=blitz"
        f"&moves=5"
        f"&topGames=0"
        f"&recentGames=0"
    )

    headers = {"Accept": "application/json"}

    print("=== 토큰 없이 요청 ===")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers)
        print(f"status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            total = data.get("white", 0) + data.get("draws", 0) + data.get("black", 0)
            print(f"total games: {total}")
        else:
            print(f"body: {resp.text[:200]}")

    print()
    print("=== 토큰 포함 요청 ===")
    headers["Authorization"] = f"Bearer {TOKEN}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers)
        print(f"status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            total = data.get("white", 0) + data.get("draws", 0) + data.get("black", 0)
            print(f"total games: {total}")
            print(f"opening: {data.get('opening')}")
        else:
            print(f"body: {resp.text[:200]}")


asyncio.run(test())
