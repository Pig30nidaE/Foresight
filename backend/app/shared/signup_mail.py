"""Send signup verification email via SMTP (stdlib, threaded)."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import smtplib
import uuid
from email.message import EmailMessage

from app.core.config import settings


def signup_code_pepper() -> bytes:
    raw = (settings.JWT_SECRET or settings.BRIDGE_JWT_SECRET or "").strip()
    if not raw:
        raise RuntimeError("JWT_SECRET (or BRIDGE_JWT_SECRET) must be set to hash signup codes")
    return raw.encode()


def hash_signup_code(user_id: uuid.UUID, code: str) -> str:
    msg = f"{user_id}:{code}".encode()
    return hmac.new(signup_code_pepper(), msg, hashlib.sha256).hexdigest()


def _send_smtp_sync(to_addr: str, subject: str, body: str) -> None:
    if not settings.SMTP_HOST.strip():
        raise RuntimeError("SMTP is not configured")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM.strip() or settings.SMTP_USER.strip()
    msg["To"] = to_addr
    msg.set_content(body)
    use_tls = settings.SMTP_USE_TLS
    if use_tls:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            smtp.starttls()
            user = settings.SMTP_USER.strip()
            password = settings.SMTP_PASSWORD
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            user = settings.SMTP_USER.strip()
            if user:
                smtp.login(user, settings.SMTP_PASSWORD)
            smtp.send_message(msg)


async def send_signup_verification_email(to_addr: str, code: str) -> None:
    subject = "[Foresight] 회원가입 이메일 인증 코드"
    body = (
        f"인증 코드: {code}\n\n"
        "코드는 15분간 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요."
    )
    await asyncio.to_thread(_send_smtp_sync, to_addr, subject, body)
