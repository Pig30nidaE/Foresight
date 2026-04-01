"""
오프닝 티어표 라우터
====================
GET  /api/v1/opening-tier/global    → 레이팅 구간별 오프닝 티어 랭킹
GET  /api/v1/opening-tier/brackets  → 레이팅 구간 목록 (Lichess + Chess.com 라벨)
GET  /api/v1/opening-tier/detail    → 오프닝 핵심 포인트 + YouTube 링크
GET  /api/v1/opening-tier/export    → CSV 또는 JSON 파일 다운로드
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.db.models.forum import User
from app.features.opening_tier.services.opening_tier_service import (
    MAX_OPENINGS_DISPLAY,
    OpeningTierService,
    RATING_BRACKETS,
)
from app.features.opening_tier.services.opening_detail_service import get_opening_detail

router = APIRouter()

_VALID_RATINGS = set(RATING_BRACKETS)  # 서비스 정의와 자동 동기화
_VALID_SPEEDS = {"bullet", "blitz", "rapid", "classical"}


def _get_service(request: Request) -> OpeningTierService:
    svc = getattr(request.app.state, "opening_tier_service", None)
    if svc is None:
        svc = OpeningTierService()
        request.app.state.opening_tier_service = svc
    return svc


def _validate_rating(rating: int) -> None:
    if rating not in _VALID_RATINGS:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 레이팅. 허용값: {sorted(_VALID_RATINGS)}",
        )


def _validate_speed(speed: str) -> None:
    if speed not in _VALID_SPEEDS:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 타임클래스. 허용값: {sorted(_VALID_SPEEDS)}",
        )


def _validate_color(color: str) -> None:
    if color not in {"white", "black"}:
        raise HTTPException(
            status_code=400,
            detail="color는 'white' 또는 'black'이어야 합니다.",
        )


@router.get("/global")
async def get_global_opening_tiers(
    request: Request,
    me: User = Depends(get_current_user),
    rating: int = Query(..., description="Lichess 레이팅 bucket (1000/1400/1800/2200/2500)"),
    speed: str = Query("blitz", description="타임클래스 (bullet/blitz/rapid/classical)"),
    color: str = Query("white", description="기준 색상 (white/black)"),
    q: str | None = Query(None, min_length=1, max_length=80, description="오프닝 검색어 (ECO/이름)"),
    allow_cold_fetch: bool = Query(
        False,
        description="true면 캐시 미존재 시 즉시 계산(무거움). 기본값 false면 warming 상태를 반환.",
    ),
):
    """레이팅 구간별 오프닝 티어 랭킹 반환.

    Lichess Explorer API 병렬 탐색으로 30–60초 소요될 수 있습니다.
    """
    _ = me
    _validate_rating(rating)
    _validate_speed(speed)
    _validate_color(color)

    _service = _get_service(request)
    try:
        openings, data_period, collected_at = await _service.get_opening_tiers(
            rating, speed, color, allow_fetch_if_missing=allow_cold_fetch
        )
    except RuntimeError as exc:
        if str(exc) == "warming":
            return {
                "state": "warming",
                "rating": rating,
                "speed": speed,
                "color": color,
                "retry_after_seconds": 8,
                "detail": "opening tier cache warming in progress",
                "data_period": "",
                "collected_at": "",
                "openings": [],
                "total_openings": 0,
            }
        raise HTTPException(status_code=503, detail=str(exc))
    openings = _service.filter_openings(openings, q)
    # 기본 티어표에서는 1% 미만 마이너 variation 을 숨기고,
    # 검색(query) 상황에서는 탐색 가능하도록 노출합니다.
    if not (q or "").strip():
        openings = [row for row in openings if not bool(row.get("is_minor", False))]
    openings = openings[:MAX_OPENINGS_DISPLAY]

    return {
        "state": "ready",
        "rating": rating,
        "speed": speed,
        "color": color,
        "total_openings": len(openings),
        "data_period": data_period,
        "collected_at": collected_at,
        "openings": openings,
    }


@router.get("/brackets")
async def get_rating_brackets(
    request: Request,
    me: User = Depends(get_current_user),
    speed: str = Query("blitz", description="타임클래스 (bullet/blitz/rapid/classical)"),
):
    """레이팅 구간 목록 반환 (Lichess 9개 구간 + Chess.com 변환 라벨)."""
    _ = me
    _service = _get_service(request)
    _validate_speed(speed)
    brackets = _service.get_bracket_labels(speed)
    return {
        "speed": speed,
        "brackets": [b.model_dump() for b in brackets],
    }


@router.get("/detail")
async def get_opening_detail_route(
    me: User = Depends(get_current_user),
    eco: str = Query(..., description="ECO 코드 (예: B20)"),
    name: str = Query(..., description="오프닝 이름 (예: Sicilian Defense)"),
    color: str = Query("white", description="기준 색상 (white/black)"),
):
    """오프닝 핵심 포인트 + YouTube 한국어 해설 영상 검색 링크 반환.

    color=white이면 백 입장에서의 핵심 아이디어,
    color=black이면 흑 입장에서의 핵심 아이디어를 반환합니다.
    """
    _ = me
    _validate_color(color)
    try:
        result = await get_opening_detail(eco=eco, name=name, color=color)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.get("/export")
async def export_opening_tiers(
    request: Request,
    me: User = Depends(get_current_user),
    rating: int = Query(..., description="Lichess 레이팅 구간"),
    speed: str = Query("blitz", description="타임클래스"),
    color: str = Query("white", description="기준 색상 (white/black)"),
    format: str = Query("json", description="내보내기 형식: json 또는 csv"),
):
    """오프닝 티어 데이터를 CSV 또는 JSON 파일로 다운로드.

    캐시된 데이터가 있으면 즉시 반환, 없으면 탐색 후 반환합니다.
    """
    _ = me
    _validate_rating(rating)
    _validate_speed(speed)
    _validate_color(color)
    _service = _get_service(request)
    if format not in {"json", "csv"}:
        raise HTTPException(
            status_code=400,
            detail="format은 'json' 또는 'csv'이어야 합니다.",
        )

    try:
        openings, _, _ = await _service.get_opening_tiers(
            rating, speed, color, allow_fetch_if_missing=True
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if format == "csv":
        content = _service.export_to_csv(openings, rating, speed, color)
        media_type = "text/csv; charset=utf-8"
        filename = f"opening_tier_{rating}_{speed}_{color}.csv"
    else:
        content = _service.export_to_json_bytes(openings, rating, speed, color)
        media_type = "application/json; charset=utf-8"
        filename = f"opening_tier_{rating}_{speed}_{color}.json"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
