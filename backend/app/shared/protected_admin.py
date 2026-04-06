from app.core.config import settings


def protected_admin_email() -> str:
    return (settings.FORUM_PROTECTED_ADMIN_EMAIL or "").strip().lower()


def protected_admin_display_name() -> str:
    name = (settings.FORUM_PROTECTED_ADMIN_DISPLAY_NAME or "").strip()
    return name or "관리자"


def is_protected_admin_email(email: str | None) -> bool:
    protected = protected_admin_email()
    return bool(protected) and (email or "").strip().lower() == protected
