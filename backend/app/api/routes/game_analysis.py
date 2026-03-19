"""
개별 게임 분석 엔드포인트 (양쪽 플레이어)
────────────────────────────────────────────────────
Stockfish 기반 T1~T6 수 품질 분석 (흑/백 모두 분석)

POST /api/v1/game-analysis/game
  → 단일 게임의 PGN을 받아 양쪽 플레이어를 T1~T6 등급으로 분석
  → 각 등급별 수 목록 포함 (클릭시 체스보드에 표시용 FEN 포함)
"""
from __future__ import annotations

import asyncio
import logging
from functools import partial

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Dict, Optional

from app.ml.game_analyzer import (
    analyze_both_players_sync,
    MoveTier,
    PlayerAnalysisResult,
    AnalyzedMove,
)
from app.models.schemas import (
    MoveTier as MoveTierSchema,
    TopMoveInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter()

class AnalyzedMoveDetail(BaseModel):
    """개별 수 분석 상세"""
    halfmove: int
    move_number: int
    color: str
    san: str
    uci: str
    fen_before: str  # 수 전 FEN (체스보드 표시용)
    fen_after: str  # 수 후 FEN
    cp_before: Optional[int]
    cp_after: Optional[int]
    cp_loss: int
    win_pct_before: float
    win_pct_after: float
    win_pct_loss: float
    tier: MoveTierSchema
    top_moves: List[TopMoveInfo]
    user_move_rank: int
    is_only_best: bool


class PlayerAnalysisData(BaseModel):
    """개별 플레이어 분석 데이터"""
    username: str
    color: str  # "white" | "black"
    total_moves: int
    analyzed_moves: List[AnalyzedMoveDetail]
    
    # 등급별 통계
    tier_counts: Dict[str, int]
    tier_percentages: Dict[str, float]
    avg_cp_loss: float
    accuracy: float
    
    # 등급별 수 목록 (필터링용)
    moves_by_tier: Dict[str, List[AnalyzedMoveDetail]] = Field(
        default_factory=dict,
        description="T1~T6별 수 목록. 예: {'T1': [...], 'T2': [...]}"
    )


class BothPlayersAnalysisResponse(BaseModel):
    """양쪽 플레이어 분석 응답"""
    game_id: str
    white_player: str
    black_player: str
    white_analysis: PlayerAnalysisData
    black_analysis: PlayerAnalysisData
    opening: Dict[str, object] = Field(
        default_factory=dict,
        description="오프닝 라인 및 이론수(TH). 예: {eco,name,th_plies,th_fullmoves}"
    )


class GameAnalysisRequest(BaseModel):
    """게임 분석 요청"""
    pgn: str
    game_id: str = ""
    time_per_move: float = 0.15  # 기본 분석 시간 (초)
    stockfish_depth: Optional[int] = None


def _convert_move_to_schema(move: AnalyzedMove) -> AnalyzedMoveDetail:
    """AnalyzedMove를 스키마로 변환"""
    return AnalyzedMoveDetail(
        halfmove=move.halfmove,
        move_number=move.move_number,
        color=move.color,
        san=move.san,
        uci=move.uci,
        fen_before=move.fen_before,
        fen_after=move.fen_after,
        cp_before=move.cp_before,
        cp_after=move.cp_after,
        cp_loss=move.cp_loss,
        win_pct_before=move.win_pct_before,
        win_pct_after=move.win_pct_after,
        win_pct_loss=move.win_pct_loss,
        tier=MoveTierSchema(move.tier.value),
        top_moves=[TopMoveInfo(**m) for m in move.top_moves],
        user_move_rank=move.user_move_rank,
        is_only_best=move.is_only_best,
    )


def _convert_player_analysis(result: PlayerAnalysisResult) -> PlayerAnalysisData:
    """PlayerAnalysisResult를 API 응답 스키마로 변환"""
    analyzed_moves = [_convert_move_to_schema(m) for m in result.analyzed_moves]
    
    # 등급별 수 목록 변환
    moves_by_tier = {
        tier: [_convert_move_to_schema(m) for m in moves]
        for tier, moves in result.moves_by_tier.items()
    }
    
    return PlayerAnalysisData(
        username=result.username,
        color=result.color,
        total_moves=result.total_moves,
        analyzed_moves=analyzed_moves,
        tier_counts=result.tier_counts,
        tier_percentages=result.tier_percentages,
        avg_cp_loss=result.avg_cp_loss,
        accuracy=result.accuracy,
        moves_by_tier=moves_by_tier,
    )


@router.post("/game", response_model=BothPlayersAnalysisResponse)
async def analyze_game_both_players(
    request: GameAnalysisRequest = Body(...),
):
    """
    **양쪽 플레이어 T1~T6 분석**
    
    PGN을 받아 Stockfish로 분석하고 **흑/백 양쪽 플레이어**의 수를 T1~T6 등급으로 분류합니다.
    
    **등급 기준:**
    - **T1 (브릴리언트)**: 불리한 상황 역전/희생 등 전술적 고품질 수
    - **T2 (최상)**: 최상급 정확수
    - **T3 (우수)**: 우수한 수
    - **T4 (양호)**: 양호한 수
    - **T5 (보통)**: 아쉬운 수
    - **T6 (실수)**: 평가 손실이 큰 실수
    
    **응답:**
    - 양쪽 플레이어 분석 데이터 (`white_analysis`, `black_analysis`)
    - 각 플레이어의 전체 수 품질 통계 (`tier_counts`, `tier_percentages`)
    - 등급별 수 목록 (`moves_by_tier`) - T1~T6 탭 필터링용
    - 수별 FEN (`fen_before`, `fen_after`) - 체스보드 표시용
    - Chess.com 방식 정확도 (`accuracy`)
    """
    if not request.pgn or not request.pgn.strip():
        raise HTTPException(status_code=400, detail="PGN이 필요합니다.")
    
    try:
        logger.info(
            f"[Game Analysis - Both Players] {request.game_id} "
            f"(time_per_move: {request.time_per_move}s)"
        )
        
        # 스레드 풀에서 동기 분석 실행
        loop = asyncio.get_event_loop()
        fn = partial(
            analyze_both_players_sync,
            pgn_str=request.pgn,
            game_id=request.game_id,
            time_per_move=request.time_per_move,
            time_per_multi=request.time_per_move * 0.8,
            stockfish_depth=request.stockfish_depth,
        )
        result = await loop.run_in_executor(None, fn)
        
        if result is None:
            raise HTTPException(
                status_code=500,
                detail="게임 분석에 실패했습니다. PGN 형식을 확인하거나 Stockfish 설정을 확인하세요."
            )
        
        # 양쪽 플레이어 변환
        white_data = _convert_player_analysis(result.white_analysis)
        black_data = _convert_player_analysis(result.black_analysis)
        
        logger.info(
            f"[Game Analysis Complete] White({white_data.username}): {white_data.accuracy}%, "
            f"Black({black_data.username}): {black_data.accuracy}%"
        )
        
        return BothPlayersAnalysisResponse(
            game_id=result.game_id,
            white_player=result.white_player,
            black_player=result.black_player,
            white_analysis=white_data,
            black_analysis=black_data,
            opening=result.opening or {},
        )
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"[Game Analysis Error] {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
