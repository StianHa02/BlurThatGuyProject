import logging
import queue
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
import redis

from detector import (
    DETECTOR_POOL_SIZE,
    apply_thread_budget as apply_detector_thread_budget,
    detect_faces,
    get_thread_pool,
)
from job_runner import CancellationToken
from queue_manager import get_job_status
from reid import apply_thread_budget as apply_reid_thread_budget
from reid import merge_tracks_by_identity
from services.storage import store_tracks
from tracker import track_detections

logger = logging.getLogger(__name__)

_h264_encoder: str | None = None

ENCODER_ARGS: dict[str, list[str]] = {
    "h264_nvenc": ["-c:v", "h264_nvenc", "-preset", "p3", "-cq", "26"],
    "h264_amf": ["-c:v", "h264_amf", "-quality", "balanced", "-qp_i", "26"],
    "h264_videotoolbox": ["-c:v", "h264_videotoolbox", "-q:v", "55"],
    "h264_qsv": ["-c:v", "h264_qsv", "-preset", "veryfast"],
    "libx264": ["-c:v", "libx264", "-crf", "26", "-preset", "ultrafast", "-threads", "0"],
}


def get_encoder() -> str:
    """Test-encode a null frame with each HW encoder; use first that actually works."""
    global _h264_encoder
    if _h264_encoder is not None:
        return _h264_encoder

    _h264_encoder = "libx264"
    if not shutil.which("ffmpeg"):
        return _h264_encoder

    for enc in ("h264_nvenc", "h264_amf", "h264_videotoolbox", "h264_qsv"):
        try:
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "fatal",
                    "-f",
                    "lavfi",
                    "-i",
                    "nullsrc=s=128x128:d=1",
                    "-c:v",
                    enc,
                    "-f",
                    "null",
                    "-",
                ],
                capture_output=True,
                timeout=10,
            )
            if result.returncode == 0:
                _h264_encoder = enc
                break
        except Exception:
            continue

    logger.info(f"Selected H.264 encoder: {_h264_encoder}")
    return _h264_encoder


def apply_job_thread_budget(r: redis.Redis, job_id: str) -> None:
    status = get_job_status(r, job_id)
    budget = status.get("thread_budget")
    if budget is None:
        return

    n_threads = max(1, int(budget))
    apply_detector_thread_budget(n_threads)
    apply_reid_thread_budget(n_threads)


def process_detection(
    video_id: str,
    video_path: Path,
    sample_rate: int,
    progress_cb=None,
    thread_budget: int | None = None,
    cancel_token: CancellationToken | None = None,
) -> list[dict]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Could not open video file")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    total_steps = max(1, (total_frames + sample_rate - 1) // sample_rate) if total_frames > 0 else 1
    completed_steps = 0
    detections_per_frame: dict[int, list[dict]] = {}
    cut_frames: set[int] = set()

    # Per-job pool sized to budget prevents jobs starving each other.
    _own_pool = thread_budget is not None
    pool = ThreadPoolExecutor(max_workers=max(1, thread_budget)) if _own_pool else get_thread_pool()
    pending_futures: list[tuple[int, object]] = []
    max_pending = (max(1, thread_budget) if _own_pool else DETECTOR_POOL_SIZE) * 2

    cut_thumb = (64, 36)
    cut_threshold = 45.0
    min_cut_gap = 8
    prev_thumb: np.ndarray | None = None
    last_cut_fi = -999

    def emit_progress(value: float) -> None:
        if progress_cb:
            progress_cb(value)

    def check_cut(fi: int, frame: np.ndarray) -> None:
        nonlocal prev_thumb, last_cut_fi
        small = cv2.resize(frame, cut_thumb)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev_thumb is not None:
            mad = float(np.mean(np.abs(gray - prev_thumb)))
            sampled_gap = (fi - last_cut_fi) // sample_rate
            if mad > cut_threshold and sampled_gap >= min_cut_gap:
                cut_frames.add(fi)
                last_cut_fi = fi
        prev_thumb = gray

    def drain_one() -> None:
        nonlocal completed_steps
        idx, fut = pending_futures.pop(0)
        try:
            faces = fut.result()
            if faces:
                detections_per_frame[idx] = faces
        except Exception as e:
            logger.error(f"Detection failed frame {idx}: {e}")

        completed_steps += 1
        emit_progress(round(completed_steps / total_steps * 80, 1))

    if shutil.which("ffmpeg") and width > 0 and height > 0 and total_frames > 0:
        frame_size = width * height * 3
        proc = subprocess.Popen(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "fatal",
                "-i",
                str(video_path),
                "-vf",
                f"select=not(mod(n\\,{sample_rate}))",
                "-vsync",
                "vfr",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "bgr24",
                "pipe:1",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        fq: queue.Queue = queue.Queue(maxsize=max_pending * 2)

        def reader() -> None:
            emitted = 0
            try:
                while True:
                    raw = proc.stdout.read(frame_size)
                    if not raw or len(raw) < frame_size:
                        break
                    frame = np.frombuffer(raw, np.uint8).reshape((height, width, 3)).copy()
                    fq.put((emitted * sample_rate, frame))
                    emitted += 1
            finally:
                fq.put(None)

        threading.Thread(target=reader, daemon=True).start()

        while True:
            item = fq.get()
            if item is None:
                break
            if cancel_token and cancel_token.cancelled:
                proc.kill()
                break
            fi, frame = item
            check_cut(fi, frame)
            pending_futures.append((fi, pool.submit(detect_faces, frame)))
            while len(pending_futures) >= max_pending:
                drain_one()

        proc.wait(timeout=30)
    else:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError("Could not open video file")

        target_idx = 0
        current_frame = 0
        while True:
            if cancel_token and cancel_token.cancelled:
                break
            if total_frames > 0 and target_idx >= total_frames:
                break
            if target_idx != current_frame and not cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx):
                break

            ret, frame = cap.read()
            if not ret:
                break

            current_frame = target_idx + 1
            check_cut(target_idx, frame)
            pending_futures.append((target_idx, pool.submit(detect_faces, frame)))
            while len(pending_futures) >= max_pending:
                drain_one()
            target_idx += sample_rate
        cap.release()

    while pending_futures:
        drain_one()

    if _own_pool:
        pool.shutdown(wait=False)

    if cancel_token and cancel_token.cancelled:
        raise InterruptedError("Job cancelled")

    emit_progress(80)
    tracks = track_detections(detections_per_frame, cut_frames)

    if cancel_token and cancel_token.cancelled:
        raise InterruptedError("Job cancelled")

    emit_progress(85)
    tracks = merge_tracks_by_identity(tracks, video_path, cancel_token=cancel_token)
    for track in tracks:
        for frame_data in track.get("frames", []):
            frame_data.pop("emb", None)

    store_tracks(video_id, tracks)
    emit_progress(100)
    return tracks

