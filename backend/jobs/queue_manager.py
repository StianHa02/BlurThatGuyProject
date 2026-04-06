# ---------------------------------------------------------------------------
# Redis-backed job queue: admission control, thread-budget rebalancing,
# heartbeat eviction, and per-job status and progress tracking.
# ---------------------------------------------------------------------------

import os
import time
import redis
from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TTL_SECONDS = 3600
MAX_ACTIVE_JOBS = 2
ADMISSION_LOCK_KEY = "btg:admission_lock"
ACTIVE_KEY = "btg:active"
WAITING_KEY = "btg:waiting"
SYSTEM_THREADS_KEY = "btg:system:total_threads"
HEARTBEAT_TTL = 60  # must exceed longest gap between progress events
_default_budget = os.cpu_count() or 4
TOTAL_THREAD_BUDGET = max(1, int(os.environ.get("TOTAL_THREAD_BUDGET") or _default_budget))


# ---------------------------------------------------------------------------
# Redis key helpers
# ---------------------------------------------------------------------------

def _status_key(job_id: str) -> str:
    return f"btg:job:{job_id}:status"


def _position_key(job_id: str) -> str:
    return f"btg:job:{job_id}:position"


def _thread_budget_key(job_id: str) -> str:
    return f"btg:job:{job_id}:thread_budget"


def _progress_key(job_id: str) -> str:
    return f"btg:job:{job_id}:progress"


def _heartbeat_key(job_id: str) -> str:
    return f"btg:job:{job_id}:hb"


# ---------------------------------------------------------------------------
# Progress and heartbeat
# ---------------------------------------------------------------------------

def set_job_progress(r: redis.Redis, job_id: str, progress: float) -> None:
    r.set(_progress_key(job_id), round(progress, 1), ex=TTL_SECONDS)


def touch_job_heartbeat(r: redis.Redis, job_id: str) -> None:
    r.set(_heartbeat_key(job_id), 1, ex=HEARTBEAT_TTL)


# ---------------------------------------------------------------------------
# Admission control
# ---------------------------------------------------------------------------

def _promote_next_locked(r: redis.Redis) -> None:
    """Promote the next waiter if there is capacity. Caller must hold admission lock."""
    if r.scard(ACTIVE_KEY) < MAX_ACTIVE_JOBS:
        next_job_id = r.lpop(WAITING_KEY)
        if next_job_id:
            r.sadd(ACTIVE_KEY, next_job_id)
            _touch_key(r, ACTIVE_KEY)
            set_job_progress(r, next_job_id, 0.0)
            touch_job_heartbeat(r, next_job_id)


def evict_stale_jobs(r: redis.Redis) -> list[str]:
    """Evict active jobs whose heartbeat has expired. Returns evicted job ids."""
    active_jobs = list(r.smembers(ACTIVE_KEY))
    if not active_jobs:
        return []

    evicted: list[str] = []
    for job_id in active_jobs:
        if r.exists(_heartbeat_key(job_id)):
            continue

        lock = r.lock(ADMISSION_LOCK_KEY, timeout=5, blocking_timeout=1)
        try:
            with lock:
                if not r.sismember(ACTIVE_KEY, job_id) or r.exists(_heartbeat_key(job_id)):
                    continue
                r.srem(ACTIVE_KEY, job_id)
                r.delete(_thread_budget_key(job_id))
                r.delete(_position_key(job_id))
                r.delete(_progress_key(job_id))
                current_status = r.get(_status_key(job_id))
                if current_status not in ("done", "error", "cancelled"):
                    r.set(_status_key(job_id), "error", ex=TTL_SECONDS)
                _touch_key(r, ACTIVE_KEY)
                _promote_next_locked(r)
                rebalance(r)
                _refresh_waiting_positions(r)
                evicted.append(job_id)
        except Exception:
            pass

    return evicted


def _set_with_ttl(r: redis.Redis, key: str, value: Any) -> None:
    r.set(key, value, ex=TTL_SECONDS)


def _touch_key(r: redis.Redis, key: str) -> None:
    if r.exists(key):
        r.expire(key, TTL_SECONDS)


def init_queue_system(r: redis.Redis) -> None:
    _set_with_ttl(r, SYSTEM_THREADS_KEY, TOTAL_THREAD_BUDGET)


def _refresh_waiting_positions(r: redis.Redis) -> None:
    waiters = r.lrange(WAITING_KEY, 0, -1)
    pipe = r.pipeline()
    if waiters:
        pipe.expire(WAITING_KEY, TTL_SECONDS)
    for idx, queued_job_id in enumerate(waiters, start=1):
        pipe.set(_position_key(queued_job_id), idx, ex=TTL_SECONDS)
        pipe.set(_status_key(queued_job_id), "queued", ex=TTL_SECONDS)
    pipe.execute()


def rebalance(r: redis.Redis) -> None:
    active_jobs = sorted(r.smembers(ACTIVE_KEY))
    if not active_jobs:
        _touch_key(r, ACTIVE_KEY)
        return

    per_job_budget = max(1, TOTAL_THREAD_BUDGET // len(active_jobs))
    pipe = r.pipeline()
    pipe.expire(ACTIVE_KEY, TTL_SECONDS)
    pipe.set(SYSTEM_THREADS_KEY, TOTAL_THREAD_BUDGET, ex=TTL_SECONDS)
    for active_job_id in active_jobs:
        pipe.set(_thread_budget_key(active_job_id), per_job_budget, ex=TTL_SECONDS)
        pipe.set(_status_key(active_job_id), "running", ex=TTL_SECONDS)
        pipe.set(_progress_key(active_job_id), 0.0, ex=TTL_SECONDS, nx=True)
        pipe.delete(_position_key(active_job_id))
    pipe.execute()


def set_job_status(r: redis.Redis, job_id: str, status: str) -> None:
    _set_with_ttl(r, _status_key(job_id), status)
    if status != "queued":
        r.delete(_position_key(job_id))


def try_admit(r: redis.Redis, job_id: str) -> bool:
    init_queue_system(r)
    lock = r.lock(ADMISSION_LOCK_KEY, timeout=5, blocking_timeout=5)
    with lock:
        if r.scard(ACTIVE_KEY) < MAX_ACTIVE_JOBS:
            r.sadd(ACTIVE_KEY, job_id)
            _touch_key(r, ACTIVE_KEY)
            set_job_status(r, job_id, "running")
            set_job_progress(r, job_id, 0.0)
            touch_job_heartbeat(r, job_id)
            rebalance(r)
            return True

        r.rpush(WAITING_KEY, job_id)
        _touch_key(r, WAITING_KEY)
        set_job_status(r, job_id, "queued")
        _set_with_ttl(r, _position_key(job_id), r.llen(WAITING_KEY))
        _set_with_ttl(r, _progress_key(job_id), 0.0)
        return False


# ---------------------------------------------------------------------------
# Job status and lifecycle
# ---------------------------------------------------------------------------

def on_job_finish(r: redis.Redis, job_id: str) -> None:
    lock = r.lock(ADMISSION_LOCK_KEY, timeout=5, blocking_timeout=5)
    with lock:
        was_active = r.srem(ACTIVE_KEY, job_id) > 0
        r.lrem(WAITING_KEY, 0, job_id)
        r.delete(_thread_budget_key(job_id))
        r.delete(_position_key(job_id))
        r.delete(_progress_key(job_id))
        r.delete(_heartbeat_key(job_id))
        current_status = r.get(_status_key(job_id))
        if current_status not in ("done", "error"):
            r.set(_status_key(job_id), "cancelled", ex=TTL_SECONDS)
        _touch_key(r, ACTIVE_KEY)

        if was_active:
            _promote_next_locked(r)

        rebalance(r)
        _refresh_waiting_positions(r)


def get_job_status(r: redis.Redis, job_id: str) -> dict[str, Any]:
    status = r.get(_status_key(job_id))
    position_raw = r.get(_position_key(job_id)) if status == "queued" else None
    budget_raw = r.get(_thread_budget_key(job_id)) if status == "running" else None
    progress_raw = r.get(_progress_key(job_id)) if status in {"running", "queued"} else None
    progress = float(progress_raw) if progress_raw is not None else (0.0 if status in {"running", "queued"} else None)
    return {
        "status": status,
        "position": int(position_raw) if position_raw is not None else None,
        "thread_budget": int(budget_raw) if budget_raw is not None else None,
        "progress": progress,
    }


def wait_until_admitted(r: redis.Redis, job_id: str, timeout: int = 300) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = get_job_status(r, job_id).get("status")
        if status == "running":
            return True
        if status in {"done", "error", "cancelled", None}:
            return False
        time.sleep(0.5)
    return False


# ---------------------------------------------------------------------------
# Redis client
# ---------------------------------------------------------------------------

def create_redis_client() -> redis.Redis:
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    init_queue_system(client)
    return client