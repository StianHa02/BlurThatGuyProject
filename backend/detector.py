# detector.py
import cv2
import numpy as np
import threading
import multiprocessing
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import onnxruntime as ort

# Fast config for CPU
_SCRFD_SIZE = 480
FACE_DETECTION_CONFIG = {"score_threshold": 0.5, "nms_threshold": 0.25}
DETECTOR_POOL_SIZE = int(os.environ.get("DETECTOR_POOL_SIZE", max(2, multiprocessing.cpu_count())))

_thread_pool = None
_detector_pool = []
_pool_lock = threading.Lock()
_pool_semaphore = None


def get_face_detector():
    global _detector_pool, _pool_semaphore
    with _pool_lock:
        if not _detector_pool:
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            path = Path(__file__).parent / "models" / "scrfd_2.5g.onnx"
            # Explicit CPU Provider
            session = ort.InferenceSession(str(path), sess_options=opts, providers=["CPUExecutionProvider"])
            _detector_pool = [session] * DETECTOR_POOL_SIZE
            _pool_semaphore = threading.Semaphore(DETECTOR_POOL_SIZE)


class _Lease:
    def __enter__(self):
        _pool_semaphore.acquire()
        with _pool_lock: return _detector_pool.pop()

    def __exit__(self, *_):
        with _pool_lock: _detector_pool.append(self._det)
        _pool_semaphore.release()


def detect_faces(image: np.ndarray) -> list[dict]:
    h, w = image.shape[:2]
    scale = min(1.0, _SCRFD_SIZE / max(h, w))
    nh, nw = int(h * scale), int(w * scale)
    canvas = np.zeros((_SCRFD_SIZE, _SCRFD_SIZE, 3), dtype=np.uint8)
    canvas[:nh, :nw] = cv2.resize(image, (nw, nh))

    blob = ((canvas[:, :, ::-1].astype(np.float32) - 127.5) / 128.0).transpose(2, 0, 1)[np.newaxis]

    with _pool_lock:  # Simplified lease for CPU stability
        session = _detector_pool[0]
        outputs = session.run(None, {"input.1": blob})

    # Standard SCRFD decoding (truncated for brevity, use your existing decode logic)
    # ... ensure your _scrfd_decode function uses the scale calculated above ...
    return your_existing_decode_logic(outputs, scale)