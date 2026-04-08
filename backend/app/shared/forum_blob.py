import os
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from azure.storage.blob.aio import BlobServiceClient
from fastapi import HTTPException, status

from app.core.config import settings


def _is_local_host_base_url(base_url: str | None) -> bool:
    raw = (base_url or "").strip()
    if not raw:
        return False
    try:
        host = (urlparse(raw).hostname or "").strip().lower()
    except Exception:
        return False
    return host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".local")


async def upload_image_bytes(
    data: bytes,
    *,
    content_type: str,
    original_filename: str,
    public_base_url: str | None = None,
    object_prefix: str = "profile",
) -> str:
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        ext = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
        }.get(content_type.lower(), ".bin")
    object_name = f"{uuid.uuid4().hex}{ext}"

    safe_prefix = (object_prefix or "").strip().strip("/") or "profile"

    supabase_url = (settings.SUPABASE_URL or "").strip().rstrip("/")
    supabase_service_key = (settings.SUPABASE_SERVICE_ROLE_KEY or "").strip()
    if supabase_url and supabase_service_key:
        bucket = (settings.SUPABASE_STORAGE_BUCKET or "avatars").strip()
        object_key = f"{safe_prefix}/{object_name}"
        upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{object_key}"
        headers = {
            "Authorization": f"Bearer {supabase_service_key}",
            "apikey": supabase_service_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(upload_url, content=data, headers=headers)
        if resp.is_error:
            detail = resp.text.strip() or "Supabase Storage upload failed"
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            )
        public_base = (settings.SUPABASE_STORAGE_PUBLIC_BASE_URL or "").strip().rstrip("/")
        if public_base:
            return f"{public_base}/{object_key}"
        return f"{supabase_url}/storage/v1/object/public/{bucket}/{object_key}"

    conn = (settings.AZURE_STORAGE_CONNECTION_STRING or "").strip()
    blob_name = object_name

    # Local fallback for environments without Azure Blob configuration.
    if not conn:
        # In deployed environments, local disk uploads are ephemeral and cause broken avatar URLs.
        if not _is_local_host_base_url(public_base_url):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Image storage is not configured for deployment. "
                    "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY "
                    "or AZURE_STORAGE_CONNECTION_STRING."
                ),
            )
        backend_root = Path(__file__).resolve().parent.parent.parent
        local_dir = backend_root / "data" / "forum_uploads"
        local_dir.mkdir(parents=True, exist_ok=True)
        (local_dir / blob_name).write_bytes(data)
        base = (public_base_url or "").strip().rstrip("/")
        if base:
            return f"{base}/uploads/{blob_name}"
        return f"/uploads/{blob_name}"

    container = (settings.AZURE_STORAGE_CONTAINER or "forum-uploads").strip()

    bsc = BlobServiceClient.from_connection_string(conn)
    container_client = bsc.get_container_client(container)
    try:
        await container_client.create_container()
    except Exception:
        pass
    blob = container_client.get_blob_client(blob_name)
    await blob.upload_blob(data, content_type=content_type, overwrite=True)

    base = (settings.AZURE_STORAGE_PUBLIC_BASE_URL or "").strip().rstrip("/")
    if base:
        return f"{base}/{blob_name}"
    account = bsc.account_name
    return f"https://{account}.blob.core.windows.net/{container}/{blob_name}"
