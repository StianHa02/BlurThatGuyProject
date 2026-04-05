import asyncio
import logging
import os
import re
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import HTTPException

try:
    import importlib

    spec = importlib.util.find_spec("dotenv")
    if spec is not None:
        importlib.import_module("dotenv").load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env.local")
except Exception:
    pass

logger = logging.getLogger(__name__)

VIDEO_PROCESSING_CONFIG = {
    "default_padding": 0.4,
    "default_target_blocks": 8,
    "max_padding": 2.0,
    "max_target_blocks": 24,
    "min_target_blocks": 4,
}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}

TEMP_DIR = Path(tempfile.gettempdir()) / "blurthatguy"
TEMP_DIR.mkdir(exist_ok=True)
CHUNK_SIZE = 1024 * 1024 * 2
UUID_PATTERN = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")

try:
    _max_upload_raw = os.environ.get("MAX_UPLOAD_SIZE_MB", "").strip()
    MAX_UPLOAD_SIZE_MB = int(_max_upload_raw) if _max_upload_raw else 0
except Exception:
    MAX_UPLOAD_SIZE_MB = 0


def validate_video_id(video_id: str) -> str:
    if not UUID_PATTERN.match(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    return video_id


def get_safe_video_path(video_id: str, suffix: str = ".mp4") -> Path:
    validate_video_id(video_id)
    return TEMP_DIR / f"{video_id}{suffix}"


def validate_video_file(filename: str | None, content_type: str | None) -> None:
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    if Path(filename).suffix.lower() not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}")
    if content_type and content_type not in ALLOWED_VIDEO_MIMETYPES:
        raise HTTPException(status_code=400, detail="Invalid video MIME type")


def cleanup_old_files() -> None:
    try:
        cutoff = datetime.now() - timedelta(hours=1)
        count = 0
        for p in TEMP_DIR.glob("*"):
            if not p.is_file():
                continue
            if datetime.fromtimestamp(p.stat().st_mtime) >= cutoff:
                continue
            p.unlink(missing_ok=True)
            count += 1
        if count:
            logger.info(f"Cleaned up {count} old temporary files")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")


async def periodic_cleanup() -> None:
    while True:
        await asyncio.sleep(3600)
        cleanup_old_files()


def validate_environment() -> None:
    if not os.environ.get("API_KEY"):
        if os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes"):
            logger.warning("WARNING: Running in DEV_MODE without API_KEY - API is unprotected")
        else:
            raise RuntimeError("FATAL: API_KEY environment variable is required. Set DEV_MODE=true for local "
                               "development.")

    if not os.environ.get("ALLOWED_ORIGINS"):
        logger.warning("WARNING: ALLOWED_ORIGINS not set - using localhost only")


def get_allowed_origins() -> list[str]:
    env = os.environ.get("ALLOWED_ORIGINS", "")
    if env:
        origins = [o.strip() for o in env.split(",") if o.strip()]
        if any("*" in o for o in origins):
            raise ValueError("Wildcards not allowed in ALLOWED_ORIGINS")
        return origins
    return ["http://localhost:3000", "http://127.0.0.1:3000"]
