#!/usr/bin/env python3
"""
Hikaru 블리츠 게임에서 희생 수를 직접 분석
Chess.com API로 최근 게임을 다운로드하고 Stockfish로 평가
"""

import asyncio
import json
import urllib.request
from datetime import datetime
import chess
import chess.pgn
import chess.engine
from collections import defaultdict


def fetch_games(username: str, max_games: int = 50, time_class: str = "blitz") -> list:
    """Chess.com API에서 게임 PGN 다운로드"""
    url = f"https://api.chess.com/pub/player/{username}/games"
    
    if time_class == "blitz":
        # 현재 달의 블리츠 게임
        today = datetime.now()
        year_month = today.strftime("%Y/%m")
        url += f"/{year_month}"
    
    print(f"Fetching games from: {url}")
    
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read())
            games = data.get("games", [])[:max_games]
            return games
    except Exception as e:
        print(f"Error fetching games: {e}")
        return []


def analyze_sacrifice(board: chess.Board, move: chess.Move, engine, depth: int = 20) -> dict:
    """
    희생 수를 분석: 이전 평가, 이후 평가, cp_loss 계산
    """
    # 희생 수 이전의 평가
    info_before = engine.analyse(board, chess.engine.Limit(depth=depth), info=chess.engine.INFO_SCORE)
    score_before = info_before.get("score")
    
    if score_before is None:
        return None
    
    if score_before.is_mate():
        cp_before = 2000.0 if score_before.mate() > 0 else -2000.0
    else:
        cp_before = float(score_before.relative.cp or 0)
    
    # 희생 수 실행
    board.push(move)
    
    # 희생 수 이후의 평가 (상대 관점)
    info_after = engine.analyse(board, chess.engine.Limit(depth=depth), info=chess.engine.INFO_SCORE)
    score_after = info_after.get("score")
    
    if score_after is None:
        board.pop()
        return None
    
    if score_after.is_mate():
        cp_after_opp = 2000.0 if score_after.mate() > 0 else -2000.0
    else:
        cp_after_opp = float(score_after.relative.cp or 0)
    
    # 내 관점으로 변환
    cp_after_me = -cp_after_opp
    
    cp_loss = cp_before - cp_after_me
    sac_delta = cp_after_me - cp_before
    
    board.pop()
    
    return {
        "cp_before": cp_before,
        "cp_after": cp_after_me,
        "cp_loss": cp_loss,
        "sac_delta": sac_delta,
    }


def find_sacrifices(pgn_str: str) -> list:
    """PGN에서 희생 수 찾기"""
    try:
        game = chess.pgn.read_game(iter(pgn_str.split('\n')))
        if not game:
            return []
        
        PIECE_VAL = {
            chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
            chess.ROOK: 5, chess.QUEEN: 9
        }
        
        sacrifices = []
        board = game.board()
        
        for node in game.mainline():
            move = node.move
            piece = board.piece_at(move.from_square)
            
            if piece is None or piece.piece_type not in PIECE_VAL:
                board.push(move)
                continue
            
            src_val = PIECE_VAL.get(piece.piece_type, 0)
            tgt_piece = board.piece_at(move.to_square)
            tgt_val = PIECE_VAL.get(tgt_piece.piece_type, 0) if tgt_piece else 0
            
            # 기물 손실이 있는 경우만
            if src_val > tgt_val:
                sacrifices.append({
                    "move": move,
                    "move_san": node.san(),
                    "move_no": board.fullmove_number,
                    "src_val": src_val,
                    "tgt_val": tgt_val,
                    "loss": src_val - tgt_val,
                })
            
            board.push(move)
        
        return sacrifices
    except Exception as e:
        print(f"Error parsing PGN: {e}")
        return []


async def main():
    print("=" * 80)
    print("Hikaru 블리츠 게임 희생 수 직접 분석")
    print("=" * 80)
    
    # 게임 다운로드
    print("\n[1] Chess.com에서 Hikaru 블리츠 게임 다운로드 중...")
    games = fetch_games("hikaru", max_games=10, time_class="blitz")
    
    if not games:
        print("❌ 게임을 찾을 수 없습니다")
        return
    
    print(f"✓ {len(games)}개 게임 로드")
    
    # Stockfish 엔진 시작
    print("\n[2] Stockfish 엔진 시작...")
    try:
        engine = chess.engine.SimpleEngine.popen_uci("/opt/homebrew/bin/stockfish")
    except Exception as e:
        print(f"❌ Stockfish를 찾을 수 없습니다: {e}")
        return
    
    try:
        # 각 게임 분석
        sac_stats = defaultdict(int)
        
        for game_idx, game_data in enumerate(games, 1):
            pgn = game_data.get("pgn", "")
            game_url = game_data.get("url", "")
            
            if not pgn:
                continue
            
            print(f"\n{'─' * 80}")
            print(f"게임 {game_idx}: {game_url}")
            print(f"{'─' * 80}")
            
            sacrifices = find_sacrifices(pgn)
            
            if not sacrifices:
                print("희생 수 없음")
                continue
            
            print(f"희생 수: {len(sacrifices)}개\n")
            
            # 최대 기물 값의 희생만 분석 (게임당 1개)
            max_sac = max(sacrifices, key=lambda s: s["loss"])
            
            board = chess.pgn.read_game(iter(pgn.split('\n'))).board()
            move_count = 0
            
            for node in chess.pgn.read_game(iter(pgn.split('\n'))).mainline():
                if node.move == max_sac["move"]:
                    analysis = analyze_sacrifice(board, max_sac["move"], engine, depth=20)
                    
                    if analysis:
                        cp_loss = analysis["cp_loss"]
                        sac_delta = analysis["sac_delta"]
                        
                        # T4 분류 확인
                        hard_blunder = cp_loss >= 120
                        severe_drop = sac_delta <= -120
                        
                        tier = "?"
                        if hard_blunder or severe_drop:
                            tier = "T4 (hard blunder/severe drop)"
                        elif cp_loss <= 8 and sac_delta >= -30:
                            tier = "T1 (brilliant)"
                        elif cp_loss <= 60 and sac_delta >= -60:
                            tier = "T2 (good)"
                        else:
                            tier = "T3 (neutral)"
                        
                        print(f"희생: {max_sac['move_san']} (수 {max_sac['move_no']})")
                        print(f"  기물 손실: {max_sac['loss']}점")
                        print(f"  cp_loss: {cp_loss:.0f} | sac_delta: {sac_delta:+.0f}")
                        print(f"  분류: {tier}")
                        
                        sac_stats[tier] += 1
                    break
                
                board.push(node.move)
                move_count += 1
        
        print(f"\n{'=' * 80}")
        print("분석 요약")
        print(f"{'=' * 80}")
        for tier in ["T1 (brilliant)", "T2 (good)", "T3 (neutral)", "T4 (hard blunder/severe drop)"]:
            count = sac_stats[tier]
            print(f"{tier}: {count}개")
    
    finally:
        engine.quit()


if __name__ == "__main__":
    asyncio.run(main())
