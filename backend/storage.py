import threading

_detection_store: dict[str, list[dict]] = {}
_job_result_store: dict[str, dict] = {}
_store_lock = threading.Lock()


def store_tracks(video_id: str, tracks: list[dict]) -> None:
    with _store_lock:
        _detection_store[video_id] = tracks


def store_job_result(job_id: str, video_id: str, tracks: list[dict]) -> None:
    with _store_lock:
        _job_result_store[job_id] = {"video_id": video_id, "results": tracks}


def get_job_result(job_id: str) -> dict | None:
    with _store_lock:
        return _job_result_store.get(job_id)


def get_tracks(video_id: str) -> list[dict] | None:
    with _store_lock:
        return _detection_store.get(video_id)



