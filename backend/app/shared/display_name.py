import re
import unicodedata

from fastapi import HTTPException, status

_DISPLAY_NAME_ALLOWED_RE = re.compile(r"^[\w][\w ._-]{1,49}$", re.UNICODE)
_RESERVED_DISPLAY_NAMES = {
    "admin",
    "administrator",
    "moderator",
    "system",
    "root",
    "null",
    "관리자",
    "운영자",
}


def normalize_display_name(value: str) -> str:
    # 1) NFKC 정규화로 유사 문자 우회 방지
    normalized = unicodedata.normalize("NFKC", value)
    # 2) 제어 문자 제거 및 공백 정규화
    normalized = "".join(ch for ch in normalized if not unicodedata.category(ch).startswith("C"))
    normalized = " ".join(normalized.strip().split())

    if len(normalized) < 2 or len(normalized) > 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Display name must be 2-50 chars")
    if not _DISPLAY_NAME_ALLOWED_RE.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name contains invalid characters",
        )
    folded = normalized.casefold()
    compact = re.sub(r"[ ._-]+", "", folded)
    if folded in _RESERVED_DISPLAY_NAMES or compact in _RESERVED_DISPLAY_NAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name is reserved",
        )
    return normalized
