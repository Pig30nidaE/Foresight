import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError

from app.core.config import settings


def _secret() -> str:
    s = (settings.JWT_SECRET or "").strip()
    if not s:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET is not configured",
        )
    return s


def _bridge_verify_secret() -> str:
    b = (settings.BRIDGE_JWT_SECRET or "").strip()
    if b:
        return b
    return _secret()


def create_access_token(
    *,
    sub: str,
    provider: str,
    provider_account_id: str,
    email: str | None,
    name: str | None,
    picture: str | None,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    exp = now + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    payload = {
        "sub": sub,
        "provider": provider,
        "provider_account_id": provider_account_id,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            _bridge_verify_secret(),
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            options={
                "verify_aud": False,
                "verify_signature": True,
                "require_exp": True,
            },
        )
    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        ) from exc
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc


def parse_uuid(value: str, *, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field}",
        ) from exc
