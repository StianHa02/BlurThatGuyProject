import logging
import threading
from pathlib import Path
from typing import Callable

import redis

from queue_manager import (
    get_job_status,
    on_job_finish,
    set_job_progress,
    set_job_status,
    touch_job_heartbeat,
    wait_until_admitted,
)


class CancellationToken:
    """Cooperative cancellation flag for detection jobs."""

    def __init__(self) -> None:
        self._cancelled = threading.Event()

    def cancel(self) -> None:
        self._cancelled.set()

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()


_cancel_tokens: dict[str, CancellationToken] = {}
_tokens_lock = threading.Lock()


def register_cancel_token(job_id: str) -> CancellationToken:
    token = CancellationToken()
    with _tokens_lock:
        _cancel_tokens[job_id] = token
    return token


def unregister_cancel_token(job_id: str) -> None:
    with _tokens_lock:
        _cancel_tokens.pop(job_id, None)


def get_cancel_token(job_id: str) -> CancellationToken | None:
    with _tokens_lock:
        return _cancel_tokens.get(job_id)


def cancel_detection_job(r: redis.Redis, job_id: str, logger: logging.Logger) -> None:
    token = get_cancel_token(job_id)
    if token:
        token.cancel()
    on_job_finish(r, job_id)
    logger.info(f"Job {job_id} cancelled by client")


def _get_job_thread_budget(r: redis.Redis, job_id: str) -> int | None:
    budget = get_job_status(r, job_id).get("thread_budget")
    return int(budget) if budget else None


def run_queued_detection_job(
    r: redis.Redis,
    job_id: str,
    video_id: str,
    video_path: Path,
    sample_rate: int,
    process_detection: Callable[..., list[dict]],
    store_job_result: Callable[[str, str, list[dict]], None],
    apply_job_thread_budget: Callable[[redis.Redis, str], None],
    logger: logging.Logger,
) -> None:
    if not wait_until_admitted(r, job_id):
        status = get_job_status(r, job_id).get("status")
        if status in {"cancelled", "done", "error"}:
            logger.info(f"Queued job {job_id} exited before run with status={status}")
            return
        set_job_status(r, job_id, "error")
        logger.error(f"Queued job {job_id} failed to be admitted (status={status})")
        return

    apply_job_thread_budget(r, job_id)
    set_job_progress(r, job_id, 0.0)

    # Keep heartbeat independent from progress callbacks so long ReID stages
    # do not get marked stale and evicted while still actively processing.
    hb_stop = threading.Event()

    def _heartbeat_loop() -> None:
        while not hb_stop.wait(15):
            touch_job_heartbeat(r, job_id)

    hb_thread = threading.Thread(target=_heartbeat_loop, daemon=True)
    hb_thread.start()
    touch_job_heartbeat(r, job_id)

    token = register_cancel_token(job_id)
    try:
        def _progress_and_hb(p: float) -> None:
            set_job_progress(r, job_id, p)
            touch_job_heartbeat(r, job_id)

        tracks = process_detection(
            video_id,
            video_path,
            sample_rate,
            progress_cb=_progress_and_hb,
            thread_budget=_get_job_thread_budget(r, job_id),
            cancel_token=token,
        )
        store_job_result(job_id, video_id, tracks)
        set_job_status(r, job_id, "done")
    except InterruptedError:
        logger.info(f"Queued job {job_id} cancelled during processing")
    except Exception as e:
        logger.error(f"Queued detection failed for {job_id}: {e}")
        set_job_status(r, job_id, "error")
    finally:
        hb_stop.set()
        hb_thread.join(timeout=1)
        unregister_cancel_token(job_id)
        on_job_finish(r, job_id)

