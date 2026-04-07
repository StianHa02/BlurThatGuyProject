# ---------------------------------------------------------------------------
# Thread-safe store for detection tracks and job results.
# In-memory dict as hot cache, disk files as durable fallback.
# Disk files are cleaned up by the periodic cleanup in config.py (1hr TTL).
# ---------------------------------------------------------------------------

import json
import threading
from pathlib import Path

from config import TEMP_DIR

_detection_store: dict[str, list[dict]] = {}
_job_result_store: dict[str, dict] = {}
_store_lock = threading.Lock()


def _disk_path(key: str, suffix: str) -> Path:
    return TEMP_DIR / f"{key}{suffix}"


def store_tracks(video_id: str, tracks: list[dict]) -> None:
    with _store_lock:
        _detection_store[video_id] = tracks
    try:
        _disk_path(video_id, "_tracks.json").write_text(json.dumps(tracks))
    except Exception:
        pass


def store_job_result(job_id: str, video_id: str, tracks: list[dict]) -> None:
    payload = {"video_id": video_id, "results": tracks}
    with _store_lock:
        _job_result_store[job_id] = payload
    try:
        _disk_path(job_id, "_result.json").write_text(json.dumps(payload))
    except Exception:
        pass


def get_job_result(job_id: str) -> dict | None:
    with _store_lock:
        cached = _job_result_store.get(job_id)
    if cached is not None:
        return cached
    # Fallback: try disk
    path = _disk_path(job_id, "_result.json")
    if path.exists():
        try:
            data = json.loads(path.read_text())
            with _store_lock:
                _job_result_store[job_id] = data
            return data
        except Exception:
            pass
    return None


def get_tracks(video_id: str) -> list[dict] | None:
    with _store_lock:
        cached = _detection_store.get(video_id)
    if cached is not None:
        return cached
    # Fallback: try disk
    path = _disk_path(video_id, "_tracks.json")
    if path.exists():
        try:
            data = json.loads(path.read_text())
            with _store_lock:
                _detection_store[video_id] = data
            return data
        except Exception:
            pass
    return None
