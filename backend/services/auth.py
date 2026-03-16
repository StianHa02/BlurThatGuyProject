import logging
import os
from pathlib import Path

from fastapi import Header, HTTPException

# Best-effort dotenv loading keeps local dev behavior stable.
try:
    from dotenv import load_dotenv

    load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env.local")
except Exception:
    pass

logger = logging.getLogger(__name__)


async def verify_api_key(x_api_key: str = Header(default=None)) -> bool:
    api_key = os.environ.get("API_KEY", "")
    dev_mode = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")

    if dev_mode:
        return True
    if api_key and x_api_key != api_key:
        logger.warning("Invalid API key attempt")
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True
