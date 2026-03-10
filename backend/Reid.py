# reid.py
import cv2
import numpy as np
import threading
import logging
from pathlib import Path
import onnxruntime as ort

logger = logging.getLogger(__name__)

_reid_session: ort.InferenceSession | None = None
_reid_lock = threading.Lock()
_loaded = False

# Constants
REID_THRESHOLD = 0.65  # Increased slightly to be more strict on CPU
REID_SAMPLES = 5  # 5 samples is the "sweet spot" for CPU speed vs accuracy
_REID_SIZE = 112


def _model_path() -> Path:
    return Path(__file__).parent / "models" / "w600k_mbf.onnx"


def get_reid_model() -> ort.InferenceSession | None:
    global _reid_session, _loaded
    with _reid_lock:
        if _loaded: return _reid_session
        _loaded = True
        path = _model_path()
        if not path.exists(): return None
        try:
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2  # Best for most CPUs to avoid overhead
            # Force CPU Provider as requested
            _reid_session = ort.InferenceSession(str(path), sess_options=opts, providers=["CPUExecutionProvider"])
            logger.info("ReID model loaded on CPU")
        except Exception as e:
            logger.error(f"ReID load failed: {e}")
    return _reid_session


def _preprocess(crop: np.ndarray) -> np.ndarray:
    img = cv2.resize(crop, (_REID_SIZE, _REID_SIZE))
    img = (img.astype(np.float32) - 127.5) / 127.5
    return img.transpose(2, 0, 1)[np.newaxis, ...]  # Result shape: [1, 3, 112, 112]


def _tracks_overlap(a: dict, b: dict) -> bool:
    return a["startFrame"] <= b["endFrame"] and b["startFrame"] <= a["endFrame"]


def merge_tracks_by_identity(tracks: list[dict], video_path: Path) -> list[dict]:
    session = get_reid_model()
    if session is None or len(tracks) < 2:
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened(): return tracks

    valid_embs = []
    track_indices = []
    input_name = session.get_inputs()[0].name

    # 1. Extraction: Process 1-by-1 to fix "same person" bug
    for idx, t in enumerate(tracks):
        frames = t["frames"]
        step = max(1, len(frames) // REID_SAMPLES)
        sampled = frames[::step][:REID_SAMPLES]

        feats = []
        for f in sampled:
            cap.set(cv2.CAP_PROP_POS_FRAMES, f["frameIndex"])
            ret, frame = cap.read()
            if not ret: continue

            x, y, w, h = [int(v) for v in f["bbox"]]
            crop = frame[max(0, y):y + h, max(0, x):x + w]
            if crop.size > 0:
                blob = _preprocess(crop)
                # single-run inference avoids shape mismatch
                out = session.run(None, {input_name: blob})[0]
                feats.append(out.flatten())

        if feats:
            avg = np.mean(feats, axis=0)
            norm = np.linalg.norm(avg)
            valid_embs.append(avg / norm if norm > 0 else avg)
            track_indices.append(idx)

    cap.release()
    if not valid_embs: return tracks

    # 2. Fast O(N^2) Comparison using Matrix Math
    embs_matrix = np.array(valid_embs)
    sim_matrix = np.dot(embs_matrix, embs_matrix.T)

    # 3. Union-Find Merge logic
    parent = list(range(len(tracks)))

    def find(i):
        if parent[i] == i: return i
        parent[i] = find(parent[i]);
        return parent[i]

    for i_ptr, i_idx in enumerate(track_indices):
        for j_ptr, j_idx in enumerate(track_indices):
            if i_ptr >= j_ptr: continue
            if _tracks_overlap(tracks[i_idx], tracks[j_idx]): continue

            if sim_matrix[i_ptr, j_ptr] >= REID_THRESHOLD:
                root_i, root_j = find(i_idx), find(j_idx)
                if root_i != root_j: parent[root_i] = root_j

    # 4. Final Grouping
    groups = {}
    for i in range(len(tracks)):
        root = find(i)
        groups.setdefault(root, []).append(i)

    result = []
    new_id = 1
    for indices in sorted(groups.values(), key=lambda g: -sum(len(tracks[i]["frames"]) for i in g)):
        group_ts = [tracks[i] for i in indices]
        all_f = sorted({f["frameIndex"]: f for t in group_ts for f in t["frames"]}.values(),
                       key=lambda x: x["frameIndex"])
        result.append({
            "id": new_id,
            "frames": all_f,
            "startFrame": all_f[0]["frameIndex"],
            "endFrame": all_f[-1]["frameIndex"],
            "thumbnailFrameIndex": group_ts[0]["thumbnailFrameIndex"],
            "mergedFrom": [t["id"] for t in group_ts]
        })
        new_id += 1
    return result