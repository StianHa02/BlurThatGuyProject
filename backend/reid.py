# reid.py
# Re-identification module: merges fragmented tracks belonging to the same person.
#
# v7 – Identity drift protection
#   - All v6 features: landmark-aligned ArcFace, centroid matching, quality
#     filtering (blur + profile), intra-track coherence check, flip augmentation
#   - NEW: Drift-aware incremental centroid. Embeddings are added one-at-a-time;
#     each must pass a consistency gate (cosine sim ≥ 0.50 to running centroid).
#     If the tracker switched people mid-track, the drifted embeddings are
#     rejected, keeping the centroid clean and preventing false merges.

import cv2
import numpy as np
import threading
import logging
import os
from pathlib import Path
import onnxruntime as ort

logger = logging.getLogger(__name__)

_reid_session: ort.InferenceSession | None = None
_reid_lock = threading.Lock()
_loaded = False

# ── Tunables (all overridable via env) ──────────────────────────────────────
REID_THRESHOLD = 0.70
_REID_SIZE = 112
_SAMPLES_PER_TRACK = 15
_TEMPORAL_BINS = 5
_MIN_CROP_PX = 30
_SIZE_RATIO_GATE = 5.0

# Quality gates
_MIN_LAPLACIAN_VAR = 15.0   # reject blurry crops below this
_MAX_YAW_RATIO = 2.8        # reject profile faces (eye-distance / eye-nose ratio)
_MIN_TRACK_COHERENCE = 0.5   # reject tracks whose embeddings are too scattered
_MIN_EMBEDDABLE_SAMPLES = 3  # need at least this many good embeddings per track
_DRIFT_GATE = 0.50           # reject embeddings with sim < this to track centroid

# ── ArcFace 112×112 alignment template (standard 5-point) ──────────────────
_ARCFACE_DST = np.array([
    [38.2946, 51.6963],  # left eye
    [73.5318, 51.5014],  # right eye
    [56.0252, 71.7366],  # nose tip
    [41.5493, 92.3655],  # left mouth corner
    [70.7299, 92.2041],  # right mouth corner
], dtype=np.float32)


def _model_path() -> Path:
    return Path(__file__).parent / "models" / "w600k_mbf.onnx"


def get_reid_model() -> ort.InferenceSession | None:
    global _reid_session, _loaded
    with _reid_lock:
        if _loaded:
            return _reid_session
        _loaded = True
        path = _model_path()
        if not path.exists():
            return None
        try:
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            opts.log_severity_level = 3
            _reid_session = ort.InferenceSession(
                str(path), sess_options=opts,
                providers=["CPUExecutionProvider"],
            )
            logger.info("ReID model loaded (v7 – drift-aware centroid, quality-filter, coherence)")
        except Exception as e:
            logger.error(f"ReID load failed: {e}")
    return _reid_session


# ── Quality checks ──────────────────────────────────────────────────────────

def _is_blurry(crop: np.ndarray) -> bool:
    """Reject blurry faces via Laplacian variance."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()) < _MIN_LAPLACIAN_VAR


def _is_profile(kps: list) -> bool:
    """Reject near-profile faces using landmark geometry.
    If the nose is much closer to one eye than the other, it's a strong yaw."""
    pts = np.array(kps, dtype=np.float32).reshape(5, 2)
    left_eye, right_eye, nose = pts[0], pts[1], pts[2]

    eye_dist = np.linalg.norm(right_eye - left_eye)
    if eye_dist < 5:
        return True  # degenerate landmarks

    nose_to_left = np.linalg.norm(nose - left_eye)
    nose_to_right = np.linalg.norm(nose - right_eye)

    # For a frontal face, nose is roughly equidistant from both eyes.
    # For a profile, one distance is much larger.
    ratio = max(nose_to_left, nose_to_right) / (min(nose_to_left, nose_to_right) + 1e-6)
    return ratio > _MAX_YAW_RATIO


# ── ArcFace alignment ──────────────────────────────────────────────────────

def _align_face(frame: np.ndarray, kps: list) -> np.ndarray | None:
    """Align a face using 5-point landmarks to the ArcFace 112×112 template."""
    src_pts = np.array(kps, dtype=np.float32).reshape(5, 2)
    M, _ = cv2.estimateAffinePartial2D(
        src_pts, _ARCFACE_DST, method=cv2.LMEDS,
    )
    if M is None:
        return None
    return cv2.warpAffine(frame, M, (_REID_SIZE, _REID_SIZE),
                          borderValue=(0, 0, 0))


def _extract_face_crop(frame: np.ndarray, bbox: list, kps: list | None) -> np.ndarray | None:
    """Extract an aligned face crop if landmarks available, else tightened bbox."""
    if kps and len(kps) == 10:
        aligned = _align_face(frame, kps)
        if aligned is not None:
            return aligned

    # Fallback: tightened bbox crop
    x, y, w, h = [float(v) for v in bbox]
    shrink = 0.15
    dx, dy = w * shrink, h * shrink
    x2, y2, w2, h2 = x + dx, y + dy, w - 2 * dx, h - 2 * dy
    if w2 < 10 or h2 < 10:
        x2, y2, w2, h2 = x, y, w, h
    fh, fw = frame.shape[:2]
    x1i, y1i = max(0, int(x2)), max(0, int(y2))
    x2i, y2i = min(fw, int(x2 + w2)), min(fh, int(y2 + h2))
    crop = frame[y1i:y2i, x1i:x2i]
    if crop.size == 0 or crop.shape[0] < 10 or crop.shape[1] < 10:
        return None
    return cv2.resize(crop, (_REID_SIZE, _REID_SIZE))


# ── Pre-processing ──────────────────────────────────────────────────────────

def _preprocess_single(img_112: np.ndarray) -> np.ndarray:
    """Normalise a 112×112 BGR image → (1, 3, 112, 112) float32."""
    return ((img_112.astype(np.float32) - 127.5) / 127.5).transpose(2, 0, 1)[np.newaxis, ...]


# ── Quality-aware frame selection ───────────────────────────────────────────

def _pick_sample_frames(frames: list[dict]) -> list[dict]:
    """Up to _SAMPLES_PER_TRACK frames, spread across _TEMPORAL_BINS.
    Strongly prefer frames that have landmarks and are not profiles."""
    if not frames:
        return []
    n = _SAMPLES_PER_TRACK
    bins = _TEMPORAL_BINS

    good = [f for f in frames
            if f["bbox"][2] >= _MIN_CROP_PX and f["bbox"][3] >= _MIN_CROP_PX]
    if not good:
        good = frames

    lo = good[0]["frameIndex"]
    hi = good[-1]["frameIndex"]
    span = max(hi - lo, 1)

    per_bin: list[list[dict]] = [[] for _ in range(bins)]
    for f in good:
        b = min(int((f["frameIndex"] - lo) / span * bins), bins - 1)
        per_bin[b].append(f)

    def _quality(f: dict) -> float:
        base = f["score"] * (f["bbox"][2] * f["bbox"][3]) ** 0.5
        kps = f.get("kps")
        if kps:
            base *= 2.0
            # Penalise profile faces in sampling priority
            if _is_profile(kps):
                base *= 0.3
        return base

    selected: list[dict] = []
    per_bin_quota = max(1, n // bins)
    for bucket in per_bin:
        bucket.sort(key=_quality, reverse=True)
        selected.extend(bucket[:per_bin_quota])

    if len(selected) < n:
        used = {id(f) for f in selected}
        rest = sorted([f for f in good if id(f) not in used],
                      key=_quality, reverse=True)
        selected.extend(rest[:n - len(selected)])

    return selected[:n]


# ── Flip-augmented ONNX inference ───────────────────────────────────────────

def _embed_single(session: ort.InferenceSession, input_name: str,
                  face_112: np.ndarray) -> np.ndarray:
    """Embed a single 112×112 face with horizontal-flip augmentation."""
    blob_orig = _preprocess_single(face_112)
    blob_flip = _preprocess_single(face_112[:, ::-1].copy())
    out_orig = session.run(None, {input_name: blob_orig})[0].flatten()
    out_flip = session.run(None, {input_name: blob_flip})[0].flatten()
    emb = out_orig + out_flip
    norm = np.linalg.norm(emb)
    return emb / norm if norm > 1e-8 else emb


def _embed_crops(session: ort.InferenceSession,
                 crops: list[np.ndarray]) -> np.ndarray:
    """Embed multiple 112×112 faces. Returns (N, D) L2-normed."""
    if not crops:
        return np.empty((0, 512), dtype=np.float32)
    input_name = session.get_inputs()[0].name
    embs = [_embed_single(session, input_name, c) for c in crops]
    return np.stack(embs, axis=0)


# ── Inline per-frame embedding (for tracker appearance gate) ────────────────

def embed_detections(frame: np.ndarray, detections: list[dict]) -> list[dict]:
    """Compute ArcFace embedding for each detection and attach as 'emb' field.

    Called inline during the detection loop so embeddings are available for
    the tracker's appearance gate.  Skips profiles/blurry/tiny faces — those
    detections keep their bbox/score/kps but get no 'emb' key.
    """
    session = get_reid_model()
    if session is None or not detections:
        return detections

    input_name = session.get_inputs()[0].name

    for det in detections:
        kps = det.get("kps")
        bbox = det["bbox"]

        # Skip tiny faces
        if bbox[2] < _MIN_CROP_PX or bbox[3] < _MIN_CROP_PX:
            continue

        # Skip profiles
        if kps and _is_profile(kps):
            continue

        crop = _extract_face_crop(frame, bbox, kps)
        if crop is None:
            continue

        # Skip blurry
        if _is_blurry(crop):
            continue

        emb = _embed_single(session, input_name, crop)
        det["emb"] = emb  # numpy array, shape (512,)

    return detections


# ── Track metadata ──────────────────────────────────────────────────────────

def _track_meta(t: dict) -> dict:
    frames = t["frames"]
    fs = set(f["frameIndex"] for f in frames)
    areas = [f["bbox"][2] * f["bbox"][3] for f in frames]
    return {
        "frame_set": fs,
        "start": frames[0]["frameIndex"],
        "end": frames[-1]["frameIndex"],
        "median_area": float(np.median(areas)),
    }


# ── Centroid + coherence (drift-aware) ──────────────────────────────────────

def _build_centroid(embeddings: np.ndarray) -> tuple[np.ndarray, float]:
    """Build L2-normalised centroid incrementally with identity drift gate.

    Instead of naively averaging all embeddings (which corrupts the centroid
    if the tracker switched identities mid-track), we:
      1. Start with the first embedding as the centroid.
      2. For each subsequent embedding, check cosine similarity to current centroid.
      3. If sim < _DRIFT_GATE → reject it (likely a different person / drift).
      4. Otherwise add it and update the running centroid.

    Returns (centroid, coherence) where coherence = mean sim of accepted
    embeddings to the final centroid.
    """
    if len(embeddings) == 0:
        return np.zeros(512, dtype=np.float32), 0.0

    if len(embeddings) == 1:
        e = embeddings[0].copy()
        norm = np.linalg.norm(e)
        return (e / norm if norm > 1e-8 else e), 1.0

    # Incremental centroid with drift gate
    accepted = [embeddings[0]]
    centroid = embeddings[0].copy()
    norm = np.linalg.norm(centroid)
    if norm > 1e-8:
        centroid /= norm

    for emb in embeddings[1:]:
        sim = float(emb @ centroid)
        if sim >= _DRIFT_GATE:
            accepted.append(emb)
            # Update centroid with new accepted embedding
            raw = np.stack(accepted, axis=0).mean(axis=0)
            norm = np.linalg.norm(raw)
            centroid = raw / norm if norm > 1e-8 else raw

    if len(accepted) < len(embeddings):
        logger.debug(f"Drift gate rejected {len(embeddings) - len(accepted)}/{len(embeddings)} embeddings")

    # Coherence = mean similarity of accepted embeddings to final centroid
    acc_mat = np.stack(accepted, axis=0)
    sims = acc_mat @ centroid
    coherence = float(sims.mean())

    return centroid, coherence


# ── Main entry point ───────────────────────────────────────────────────────

def merge_tracks_by_identity(tracks: list[dict], video_path: Path) -> list[dict]:
    session = get_reid_model()
    if session is None or len(tracks) < 2:
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    # ── 1. Plan which frames to sample ──────────────────────────────────────
    sample_plan: list[list[dict]] = []
    frame_requests: dict[int, list[tuple[int, int]]] = {}

    for ti, t in enumerate(tracks):
        chosen = _pick_sample_frames(t["frames"])
        sample_plan.append(chosen)
        for si, f in enumerate(chosen):
            frame_requests.setdefault(f["frameIndex"], []).append((ti, si))

    # ── 2. Single sequential video pass → read all crops ────────────────────
    needed_frames = sorted(frame_requests.keys())
    # Store (crop, has_kps) per track
    track_crops: list[list[np.ndarray]] = [[] for _ in range(len(tracks))]

    if needed_frames:
        current_pos = -1
        for target_fi in needed_frames:
            if target_fi != current_pos:
                gap = target_fi - current_pos
                if gap < 0 or gap > 30:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, target_fi)
                else:
                    for _ in range(gap):
                        cap.grab()
            ret, frame = cap.read()
            current_pos = target_fi + 1
            if not ret:
                continue
            for ti, si in frame_requests[target_fi]:
                f = sample_plan[ti][si]
                kps = f.get("kps")

                # Quality gate 1: reject profile faces
                if kps and _is_profile(kps):
                    continue

                crop = _extract_face_crop(frame, f["bbox"], kps)
                if crop is None:
                    continue

                # Quality gate 2: reject blurry crops
                if _is_blurry(crop):
                    continue

                track_crops[ti].append(crop)

    cap.release()

    # ── 3. Embed all crops → centroid per track ─────────────────────────────
    centroids: list[np.ndarray | None] = []
    coherences: list[float] = []
    valid_track_indices: list[int] = []

    for ti in range(len(tracks)):
        crops = track_crops[ti]
        if len(crops) < _MIN_EMBEDDABLE_SAMPLES:
            centroids.append(None)
            coherences.append(0.0)
            continue
        embs = _embed_crops(session, crops)
        centroid, coherence = _build_centroid(embs)
        centroids.append(centroid)
        coherences.append(coherence)

        if coherence >= _MIN_TRACK_COHERENCE:
            valid_track_indices.append(ti)
        else:
            logger.debug(f"Track {tracks[ti]['id']}: low coherence {coherence:.3f}, "
                         f"excluded from ReID")

    if len(valid_track_indices) < 2:
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    # ── 4. Track metadata for pruning ───────────────────────────────────────
    metas = [_track_meta(t) for t in tracks]

    # ── 5. Centroid comparison with two-stage pruning ───────────────────────
    candidates: list[tuple[float, int, int]] = []

    for ii in range(len(valid_track_indices)):
        i = valid_track_indices[ii]
        mi = metas[i]
        ci = centroids[i]
        for jj in range(ii + 1, len(valid_track_indices)):
            j = valid_track_indices[jj]
            mj = metas[j]

            # STAGE 1a: temporal overlap → cannot be same person
            if mi["start"] <= mj["end"] and mj["start"] <= mi["end"]:
                if not mi["frame_set"].isdisjoint(mj["frame_set"]):
                    continue

            # STAGE 1b: face-area ratio gate
            ratio = mi["median_area"] / max(mj["median_area"], 1.0)
            if ratio > _SIZE_RATIO_GATE or ratio < 1.0 / _SIZE_RATIO_GATE:
                continue

            # STAGE 2: centroid cosine similarity
            cj = centroids[j]
            score = float(ci @ cj)

            if score >= REID_THRESHOLD:
                candidates.append((score, i, j))

    candidates.sort(key=lambda x: x[0], reverse=True)
    logger.info(f"ReID: {len(valid_track_indices)} embeddable tracks, "
                f"{len(candidates)} merge candidates (threshold={REID_THRESHOLD})")

    # ── 6. Conflict-aware union-find merge ──────────────────────────────────
    parent = list(range(len(tracks)))
    group_frames: dict[int, set] = {i: metas[i]["frame_set"].copy()
                                     for i in range(len(tracks))}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for score, idx_a, idx_b in candidates:
        ra, rb = find(idx_a), find(idx_b)
        if ra == rb:
            continue
        if not group_frames[ra].isdisjoint(group_frames[rb]):
            continue
        parent[rb] = ra
        group_frames[ra].update(group_frames[rb])

    # ── 7. Build output ─────────────────────────────────────────────────────
    groups: dict[int, list[int]] = {}
    for i in range(len(tracks)):
        groups.setdefault(find(i), []).append(i)

    result: list[dict] = []
    new_id = 1
    for indices in sorted(groups.values(),
                          key=lambda g: -sum(len(tracks[i]["frames"]) for i in g)):
        group_ts = [tracks[i] for i in indices]
        frame_map: dict[int, dict] = {}
        for t in group_ts:
            for f in t["frames"]:
                fi = f["frameIndex"]
                if fi not in frame_map or f["score"] > frame_map[fi]["score"]:
                    frame_map[fi] = f

        sorted_f = [frame_map[k] for k in sorted(frame_map.keys())]
        result.append({
            "id": new_id,
            "frames": sorted_f,
            "startFrame": sorted_f[0]["frameIndex"],
            "endFrame": sorted_f[-1]["frameIndex"],
            "thumbnailFrameIndex": group_ts[0]["thumbnailFrameIndex"],
            "mergedFrom": [t["id"] for t in group_ts],
        })
        new_id += 1

    merged_count = len(tracks) - len(result)
    logger.info(f"ReID: {len(tracks)} tracks → {len(result)} identities "
                f"({merged_count} merged)")
    return result
