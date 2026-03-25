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

FACE_DETECTION_CONFIG = {"score_threshold": 0.55, "nms_threshold": 0.25, "max_faces": 5000}

# Exported for main.py
DETECTOR_POOL_SIZE = int(os.environ.get("DETECTOR_POOL_SIZE", max(2, multiprocessing.cpu_count())))


_SCRFD_SIZE = 640
_scrfd_anchors: dict = {}
_SCRFD_INPUT = "input.1"
_SCRFD_STRIDES = [
    ("446", "449", "452", 8),
    ("466", "469", "472", 16),
    ("486", "489", "492", 32),
]

# ---------------------------------------------------------------------------
# Internal pool state
# ---------------------------------------------------------------------------

_thread_pool: ThreadPoolExecutor | None = None
_model_path: Path | None = None
_detector_pool: list = []
_pool_lock = threading.Lock()
_pool_semaphore: threading.Semaphore | None = None
_onnx_thread_budget = max(1, int(os.environ.get("ONNX_THREAD_BUDGET", "2")))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_model_path() -> Path:
    global _model_path
    if _model_path is None:
        backend_dir = Path(__file__).resolve().parent.parent
        _model_path = backend_dir / "models" / "scrfd_2.5g.onnx"
    return _model_path


def get_thread_pool() -> ThreadPoolExecutor:
    """Restored function for main.py"""
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=DETECTOR_POOL_SIZE)
        logger.info(f"Thread pool created with {DETECTOR_POOL_SIZE} workers")
    return _thread_pool


def _create_session(model_path: str) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = _onnx_thread_budget
    opts.inter_op_num_threads = _onnx_thread_budget
    return ort.InferenceSession(
        model_path,
        sess_options=opts,
        providers=["CPUExecutionProvider"],
    )


def _rebuild_pool_locked() -> None:
    global _detector_pool, _pool_semaphore
    model_path_obj = _get_model_path()
    if not model_path_obj.exists():
        raise FileNotFoundError(f"SCRFD model not found at {model_path_obj}")
    model_path = str(model_path_obj)
    _detector_pool = [_create_session(model_path) for _ in range(DETECTOR_POOL_SIZE)]
    _pool_semaphore = threading.Semaphore(DETECTOR_POOL_SIZE)


def get_face_detector() -> None:
    """Initializes the detector session on CPU."""
    with _pool_lock:
        if not _detector_pool:
            _rebuild_pool_locked()
            logger.info(
                f"SCRFD: {DETECTOR_POOL_SIZE} independent sessions on CPU, "
                f"input size {_SCRFD_SIZE}, thread budget {_onnx_thread_budget}"
            )
    get_thread_pool()


def apply_thread_budget(n_threads: int) -> None:
    """Safely apply a new ONNX thread budget.

    If the pool is idle all sessions are rebuilt immediately.
    If inference is in progress the budget is updated for the *next* rebuild
    (which happens on the next idle apply_thread_budget call) rather than
    blocking active jobs for several seconds while sessions are recreated.
    """
    global _onnx_thread_budget
    # Divide budget across pool so total threads never exceeds n_threads.
    target_threads = max(1, int(n_threads) // DETECTOR_POOL_SIZE)
    if target_threads == _onnx_thread_budget:
        return

    if _pool_semaphore is None and not _detector_pool:
        _onnx_thread_budget = target_threads
        return

    if _pool_semaphore is not None:
        # Try to acquire all slots non-blocking.  If any are held by active
        # inference we skip the session rebuild this time — the budget variable
        # is updated so the next idle call will pick it up.
        acquired = 0
        for _ in range(DETECTOR_POOL_SIZE):
            if _pool_semaphore.acquire(blocking=False):
                acquired += 1
            else:
                break

        if acquired < DETECTOR_POOL_SIZE:
            # Pool busy — release what we grabbed and defer the rebuild.
            for _ in range(acquired):
                _pool_semaphore.release()
            _onnx_thread_budget = target_threads
            logger.info(f"SCRFD pool busy — thread budget deferred to {_onnx_thread_budget}")
            return

        # All slots acquired (pool idle) — safe to rebuild without blocking callers.
        with _pool_lock:
            _onnx_thread_budget = target_threads
            _rebuild_pool_locked()
            logger.info(f"SCRFD thread budget updated to {_onnx_thread_budget}")


class _DetectorLease:
    def __enter__(self):
        if _pool_semaphore is None:
            raise RuntimeError("Detector pool is not initialized")
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
    all_boxes, all_scores, all_kps = [], [], []
    for score_key, bbox_key, kps_key, stride in _SCRFD_STRIDES:
        score = named[score_key].reshape(-1)
        bbox  = named[bbox_key].reshape(-1, 4) * stride
        kps   = named[kps_key].reshape(-1, 10) * stride  # 5 points × 2 coords
        mask = score >= thresh
        if not mask.any():
            continue
        a = anchors[stride][mask]
        b = bbox[mask]
        k = kps[mask].copy().reshape(-1, 5, 2)
        x1 = (a[:, 0] - b[:, 0]) / scale
        y1 = (a[:, 1] - b[:, 1]) / scale
        x2 = (a[:, 0] + b[:, 2]) / scale
        y2 = (a[:, 1] + b[:, 3]) / scale
        all_boxes.append(np.stack([x1, y1, x2 - x1, y2 - y1], axis=1))
        all_scores.append(score[mask])
        # Decode keypoints: anchor + offset, then rescale to original image coords
        k[:, :, 0] = (k[:, :, 0] + a[:, 0:1]) / scale
        k[:, :, 1] = (k[:, :, 1] + a[:, 1:2]) / scale
        all_kps.append(k.reshape(-1, 10))
    if not all_boxes:
        return []
    boxes  = np.concatenate(all_boxes)
    scores = np.concatenate(all_scores)
    kps_all = np.concatenate(all_kps)
    # cv2.dnn.NMSBoxes accepts ndarray; keep as lists-of-lists for the API
    idx = cv2.dnn.NMSBoxes(boxes.tolist(), scores.tolist(), thresh, FACE_DETECTION_CONFIG["nms_threshold"])
    if not len(idx):
        return []
    sel = idx.flatten()
    return [{"bbox": boxes[i].tolist(), "score": float(scores[i]),
             "kps": kps_all[i].tolist()} for i in sel]


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