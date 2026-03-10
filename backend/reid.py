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
REID_THRESHOLD = 0.70  # Stricter threshold to prevent false positives
REID_SAMPLES = 5  # 5 samples is the best balance for CPU
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
            opts.intra_op_num_threads = 2
            _reid_session = ort.InferenceSession(str(path), sess_options=opts, providers=["CPUExecutionProvider"])
            logger.info("ReID model loaded on CPU (Conflict-Aware Mode)")
        except Exception as e:
            logger.error(f"ReID load failed: {e}")
    return _reid_session


def _preprocess(crop: np.ndarray) -> np.ndarray:
    img = cv2.resize(crop, (_REID_SIZE, _REID_SIZE))
    img = (img.astype(np.float32) - 127.5) / 127.5
    return img.transpose(2, 0, 1)[np.newaxis, ...]


def merge_tracks_by_identity(tracks: list[dict], video_path: Path) -> list[dict]:
    session = get_reid_model()
    if session is None or len(tracks) < 2:
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened(): return tracks

    # Pre-calculate frame sets for every track for instant overlap checking
    for t in tracks:
        t["_frame_set"] = set(f["frameIndex"] for f in t["frames"])

    valid_embs = []
    track_indices = []
    input_name = session.get_inputs()[0].name

    # 1. Feature Extraction (One-by-one to avoid shape errors)
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
                out = session.run(None, {input_name: blob})[0]
                feats.append(out.flatten())

        if feats:
            avg = np.mean(feats, axis=0)
            norm = np.linalg.norm(avg)
            valid_embs.append(avg / norm if norm > 0 else avg)
            track_indices.append(idx)

    cap.release()
    if not valid_embs: return tracks

    # 2. Similarity Matrix
    embs_matrix = np.array(valid_embs)
    sim_matrix = np.dot(embs_matrix, embs_matrix.T)

    # 3. Greedy Conflict-Aware Merging
    # We collect all potential merges and sort them by highest similarity first
    candidates = []
    for i_ptr in range(len(track_indices)):
        for j_ptr in range(i_ptr + 1, len(track_indices)):
            score = sim_matrix[i_ptr, j_ptr]
            if score >= REID_THRESHOLD:
                candidates.append((score, track_indices[i_ptr], track_indices[j_ptr]))

    candidates.sort(key=lambda x: x[0], reverse=True)

    # Union-Find state
    parent = list(range(len(tracks)))
    # Track which frames each identity "owns"
    group_frames = {i: tracks[i]["_frame_set"].copy() for i in range(len(tracks))}

    def find(i):
        if parent[i] == i: return i
        parent[i] = find(parent[i])
        return parent[i]

    for score, idx_a, idx_b in candidates:
        root_a, root_b = find(idx_a), find(idx_b)
        if root_a == root_b: continue

        # PHYSICAL CONSTRAINT: Check if Identity A and Identity B ever exist at the same time
        # If their frame sets intersect, they CANNOT be the same person.
        if not group_frames[root_a].isdisjoint(group_frames[root_b]):
            continue

        # Merge B into A
        parent[root_b] = root_a
        group_frames[root_a].update(group_frames[root_b])

    # 4. Final Grouping and Result Construction
    groups = {}
    for i in range(len(tracks)):
        root = find(i)
        groups.setdefault(root, []).append(i)

    result = []
    new_id = 1
    for indices in sorted(groups.values(), key=lambda g: -sum(len(tracks[i]["frames"]) for i in g)):
        group_ts = [tracks[i] for i in indices]

        # Merge frames and remove duplicates (keep best score for each frame)
        frame_map = {}
        for t in group_ts:
            for f in t["frames"]:
                f_idx = f["frameIndex"]
                if f_idx not in frame_map or f["score"] > frame_map[f_idx]["score"]:
                    frame_map[f_idx] = f

        sorted_f = [frame_map[k] for k in sorted(frame_map.keys())]

        result.append({
            "id": new_id,
            "frames": sorted_f,
            "startFrame": sorted_f[0]["frameIndex"],
            "endFrame": sorted_f[-1]["frameIndex"],
            "thumbnailFrameIndex": group_ts[0]["thumbnailFrameIndex"],
            "mergedFrom": [t["id"] for t in group_ts]
        })
        new_id += 1

    # Cleanup internal helper
    for t in tracks: t.pop("_frame_set", None)

    logger.info(f"ReID: {len(tracks)} tracks -> {len(result)} identities (Conflict-Aware).")
    return result
