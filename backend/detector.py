# detector.py
# SCRFD-2.5G face detector optimized for CPU.
# Exports: detect_faces, get_face_detector, get_thread_pool, DETECTOR_POOL_SIZE

import cv2
import numpy as np
import threading
import logging
import multiprocessing
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import onnxruntime as ort

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FACE_DETECTION_CONFIG = {"score_threshold": 0.5, "nms_threshold": 0.25, "max_faces": 5000}

# Exported for main.py
DETECTOR_POOL_SIZE = int(os.environ.get("DETECTOR_POOL_SIZE", max(2, multiprocessing.cpu_count())))

# Optimized size for CPU (480 is faster than 640)
_SCRFD_SIZE = 480
_scrfd_anchors: dict = {}
_SCRFD_INPUT = "input.1"
_SCRFD_STRIDES = [
    ("446", "449", 8),
    ("466", "469", 16),
    ("486", "489", 32),
]

# ---------------------------------------------------------------------------
# Internal pool state
# ---------------------------------------------------------------------------

_thread_pool: ThreadPoolExecutor | None = None
_model_path: Path | None = None
_detector_pool: list = []
_pool_lock = threading.Lock()
_pool_semaphore: threading.Semaphore | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_model_path() -> Path:
    global _model_path
    if _model_path is None:
        _model_path = Path(__file__).parent / "models" / "scrfd_2.5g.onnx"
    return _model_path


def get_thread_pool() -> ThreadPoolExecutor:
    """Restored function for main.py"""
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=DETECTOR_POOL_SIZE)
        logger.info(f"Thread pool created with {DETECTOR_POOL_SIZE} workers")
    return _thread_pool


def get_face_detector() -> None:
    """Initializes the detector session on CPU."""
    global _detector_pool, _pool_semaphore
    with _pool_lock:
        if not _detector_pool:
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            # Force CPU Provider for stability
            session = ort.InferenceSession(
                str(_get_model_path()), sess_options=opts,
                providers=["CPUExecutionProvider"])
            logger.info(f"SCRFD session ready on CPU, size {_SCRFD_SIZE}")

            _detector_pool = [session] * DETECTOR_POOL_SIZE
            _pool_semaphore = threading.Semaphore(DETECTOR_POOL_SIZE)
    get_thread_pool()


class _DetectorLease:
    def __enter__(self):
        _pool_semaphore.acquire()
        with _pool_lock:
            self._det = _detector_pool.pop()
        return self._det

    def __exit__(self, *_):
        with _pool_lock:
            _detector_pool.append(self._det)
        _pool_semaphore.release()


def _get_scrfd_anchors() -> dict:
    if not _scrfd_anchors:
        for stride in (8, 16, 32):
            n = _SCRFD_SIZE // stride
            cols = np.tile(np.arange(n), n)
            rows = np.repeat(np.arange(n), n)
            centers = np.stack([cols, rows], axis=1) * stride
            _scrfd_anchors[stride] = np.repeat(centers, 2, axis=0).astype(np.float32)
    return _scrfd_anchors


def _scrfd_decode(outputs: list, output_names: list, scale: float) -> list[dict]:
    named = {n: o for n, o in zip(output_names, outputs)}
    anchors = _get_scrfd_anchors()
    thresh = FACE_DETECTION_CONFIG["score_threshold"]
    all_boxes, all_scores = [], []
    for score_key, bbox_key, stride in _SCRFD_STRIDES:
        score = named[score_key].reshape(-1)
        bbox  = named[bbox_key].reshape(-1, 4) * stride
        mask = score >= thresh
        if not mask.any():
            continue
        a = anchors[stride][mask]
        b = bbox[mask]
        x1 = (a[:, 0] - b[:, 0]) / scale
        y1 = (a[:, 1] - b[:, 1]) / scale
        x2 = (a[:, 0] + b[:, 2]) / scale
        y2 = (a[:, 1] + b[:, 3]) / scale
        all_boxes.append(np.stack([x1, y1, x2 - x1, y2 - y1], axis=1))
        all_scores.append(score[mask])
    if not all_boxes:
        return []
    boxes  = np.concatenate(all_boxes).tolist()
    scores = np.concatenate(all_scores).tolist()
    idx = cv2.dnn.NMSBoxes(boxes, scores, thresh, FACE_DETECTION_CONFIG["nms_threshold"])
    if not len(idx):
        return []
    return [{"bbox": boxes[i], "score": float(scores[i])} for i in idx.flatten()]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_faces(image: np.ndarray) -> list[dict]:
    """Detect faces in a BGR image."""
    h, w = image.shape[:2]
    scale = min(1.0, _SCRFD_SIZE / max(h, w))
    nh, nw = int(h * scale), int(w * scale)
    canvas = np.zeros((_SCRFD_SIZE, _SCRFD_SIZE, 3), dtype=np.uint8)
    canvas[:nh, :nw] = cv2.resize(image, (nw, nh)) if scale < 1.0 else image[:nh, :nw]
    blob = ((canvas[:, :, ::-1].astype(np.float32) - 127.5) / 128.0).transpose(2, 0, 1)[np.newaxis]
    with _DetectorLease() as session:
        output_names = [o.name for o in session.get_outputs()]
        outputs = session.run(None, {_SCRFD_INPUT: blob})
    return _scrfd_decode(outputs, output_names, scale)