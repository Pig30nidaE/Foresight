import os
import uuid

from azure.storage.blob.aio import BlobServiceClient
from fastapi import HTTPException, status

from app.core.config import settings


async def upload_image_bytes(
    data: bytes,
    *,
    content_type: str,
    original_filename: str,
) -> str:
    conn = (settings.AZURE_STORAGE_CONNECTION_STRING or "").strip()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure Blob storage is not configured",
        )
    container = (settings.AZURE_STORAGE_CONTAINER or "forum-uploads").strip()
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        ext = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
        }.get(content_type.lower(), ".bin")
    blob_name = f"{uuid.uuid4().hex}{ext}"

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
