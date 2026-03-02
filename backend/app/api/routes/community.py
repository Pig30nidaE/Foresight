"""
커뮤니티 / 공지 게시판 라우터 — 미래 기능
=========================================
담당: 추후 지정
"""
from fastapi import APIRouter

router = APIRouter()


# TODO: 커뮤니티 게시판 기능 구현 예정

@router.get("/placeholder")
async def community_placeholder():
    """커뮤니티 기능 구현 예정"""
    return {"message": "Community — Coming Soon"}
