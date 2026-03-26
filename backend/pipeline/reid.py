import cv2
import numpy as np
import threading
import logging
import os
import multiprocessing
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import onnxruntime as ort

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Session pool
# ---------------------------------------------------------------------------
# pool_size × intra_op_threads ≤ cpu_count to avoid over-subscription.
_CPU_COUNT = multiprocessing.cpu_count()
REID_POOL_SIZE = max(1, min(4, _CPU_COUNT // 2))
_REID_INTRA_THREADS = max(1, min(4, _CPU_COUNT // REID_POOL_SIZE))
_reid_thread_budget = int(os.environ.get("ONNX_THREAD_BUDGET", str(_REID_INTRA_THREADS)))

_reid_pool: list = []
_pool_lock = threading.Lock()
_pool_semaphore: threading.Semaphore | None = None
_loaded = False

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------
REID_THRESHOLD = 0.72

_REID_SIZE = 112
_SAMPLES_PER_TRACK = 15
_TEMPORAL_BINS = 5
_MIN_CROP_PX = 30
_SIZE_RATIO_GATE = 5.0

_MAX_TOTAL_SEEKS = int(os.environ.get("REID_MAX_SEEKS", "3000"))

_MIN_LAPLACIAN_VAR = 15.0
_MAX_YAW_RATIO = 2.8
_MIN_TRACK_COHERENCE = 0.5
_MIN_EMBEDDABLE_SAMPLES = 3
_DRIFT_GATE = 0.45

# ---------------------------------------------------------------------------
# ArcFace alignment template
# ---------------------------------------------------------------------------
_ARCFACE_DST = np.array([
    [38.2946, 51.6963],  # left eye
    [73.5318, 51.5014],  # right eye
    [56.0252, 71.7366],  # nose tip
    [41.5493, 92.3655],  # left mouth corner
    [70.7299, 92.2041],  # right mouth corner
], dtype=np.float32)


def _model_path() -> Path:
    models_dir = Path(__file__).resolve().parent.parent / "models"
    r50 = models_dir / "w600k_r50.onnx"
    mbf = models_dir / "w600k_mbf.onnx"
    if r50.exists():
        return r50
    return mbf


def _create_reid_session(path: Path) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = _reid_thread_budget
    opts.inter_op_num_threads = _reid_thread_budget
    opts.log_severity_level = 3
    return ort.InferenceSession(
        str(path),
        sess_options=opts,
        providers=["CPUExecutionProvider"],
    )


def _rebuild_pool_locked(path: Path) -> None:
    global _reid_pool, _pool_semaphore
    _reid_pool = [_create_reid_session(path) for _ in range(REID_POOL_SIZE)]
    _pool_semaphore = threading.Semaphore(REID_POOL_SIZE)


def get_reid_model() -> ort.InferenceSession | None:
    """Initialise the session pool and return one session (for startup checks)."""
    global _loaded
    with _pool_lock:
        if _loaded:
            return _reid_pool[0] if _reid_pool else None
        _loaded = True
        path = _model_path()
        if not path.exists():
            logger.warning(f"ReID model not found at {path}")
            return None
        try:
            _rebuild_pool_locked(path)
            logger.info(
                f"ReID model loaded: {path.stem} — "
                f"{REID_POOL_SIZE} sessions × {_reid_thread_budget} thread budget "
                f"({_CPU_COUNT} logical CPUs)"
            )
        except Exception as e:
            logger.error(f"ReID load failed: {e}")
            return None
    return _reid_pool[0] if _reid_pool else None


def apply_thread_budget(n_threads: int) -> None:
    global _reid_thread_budget, _loaded
    target_threads = max(1, int(n_threads) // REID_POOL_SIZE)
    if _pool_semaphore is None and not _reid_pool:
        _reid_thread_budget = target_threads
        return

    if _pool_semaphore is not None:
        # Drain all leases before recreating sessions.
        for _ in range(REID_POOL_SIZE):
            _pool_semaphore.acquire()

    with _pool_lock:
        path = _model_path()
        if not path.exists():
            logger.warning(f"ReID model not found at {path}")
            return
        _reid_thread_budget = target_threads
        _loaded = True
        _rebuild_pool_locked(path)
        logger.info(f"ReID thread budget updated to {_reid_thread_budget}")


class _ReidLease:
    """Borrow one ReID session from the pool; block if all are busy."""
    def __enter__(self) -> ort.InferenceSession:
        if _pool_semaphore is None:
            raise RuntimeError("ReID pool is not initialized")
        _pool_semaphore.acquire()
        with _pool_lock:
            self._session = _reid_pool.pop()
        return self._session

    def __exit__(self, *_):
        with _pool_lock:
            _reid_pool.append(self._session)
        _pool_semaphore.release()


# ---------------------------------------------------------------------------
# Quality checks
# ---------------------------------------------------------------------------

def _is_blurry(crop: np.ndarray) -> bool:
    """Reject blurry faces via Laplacian variance."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()) < _MIN_LAPLACIAN_VAR


def _is_profile(kps: list) -> bool:
    """Reject near-profile faces via nose-to-eye distance ratio."""
    pts = np.array(kps, dtype=np.float32).reshape(5, 2)
    left_eye, right_eye, nose = pts[0], pts[1], pts[2]

    eye_dist = np.linalg.norm(right_eye - left_eye)
    if eye_dist < 5:
        return True  # degenerate landmarks

    nose_to_left = np.linalg.norm(nose - left_eye)
    nose_to_right = np.linalg.norm(nose - right_eye)

    ratio = max(nose_to_left, nose_to_right) / (min(nose_to_left, nose_to_right) + 1e-6)
    return ratio > _MAX_YAW_RATIO


# ---------------------------------------------------------------------------
# ArcFace alignment
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Pre-processing
# ---------------------------------------------------------------------------

def _preprocess_single(img_112: np.ndarray) -> np.ndarray:
    """Normalise a 112×112 BGR image → (1, 3, 112, 112) float32."""
    return ((img_112.astype(np.float32) - 127.5) / 127.5).transpose(2, 0, 1)[np.newaxis, ...]


# ---------------------------------------------------------------------------
# Quality-aware frame selection
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Flip-augmented ONNX inference
# ---------------------------------------------------------------------------

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


_EMBED_BATCH_SIZE = 32


def _embed_crops(session: ort.InferenceSession,
                 crops: list[np.ndarray]) -> np.ndarray:
    """Batched ONNX inference with flip augmentation. Returns (N, D) L2-normed embeddings."""
    if not crops:
        return np.empty((0, 512), dtype=np.float32)
    input_name = session.get_inputs()[0].name
    all_embs = []
    for start in range(0, len(crops), _EMBED_BATCH_SIZE):
        batch = crops[start:start + _EMBED_BATCH_SIZE]
        blob_orig = np.concatenate(
            [_preprocess_single(c) for c in batch], axis=0
        )
        blob_flip = np.concatenate(
            [_preprocess_single(c[:, ::-1].copy()) for c in batch], axis=0
        )
        out_orig = session.run(None, {input_name: blob_orig})[0]  # (B, D)
        out_flip = session.run(None, {input_name: blob_flip})[0]  # (B, D)
        embs = out_orig + out_flip  # (B, D)
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-8)
        all_embs.append(embs / norms)
    return np.concatenate(all_embs, axis=0)


# ---------------------------------------------------------------------------
# Inline per-frame embedding
# ---------------------------------------------------------------------------

def embed_detections(frame: np.ndarray, detections: list[dict]) -> list[dict]:
    """Attach ArcFace 'emb' field to each viable detection. Skips tiny/blurry/profile faces."""
    if not _reid_pool or not detections:
        return detections

    with _ReidLease() as session:
        input_name = session.get_inputs()[0].name

        for det in detections:
            kps = det.get("kps")
            bbox = det["bbox"]

            if bbox[2] < _MIN_CROP_PX or bbox[3] < _MIN_CROP_PX:
                continue

            if kps and _is_profile(kps):
                continue

            crop = _extract_face_crop(frame, bbox, kps)
            if crop is None:
                continue

            if _is_blurry(crop):
                continue

            emb = _embed_single(session, input_name, crop)
            det["emb"] = emb

    return detections


# ---------------------------------------------------------------------------
# Track metadata
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Centroid + coherence
# ---------------------------------------------------------------------------

def _build_centroid(embeddings: np.ndarray) -> tuple[np.ndarray, float]:
    """Incremental L2-normalised centroid that rejects drifted embeddings.

    Returns (centroid, coherence) where coherence = mean cosine similarity
    of accepted embeddings to the final centroid.
    """
    if len(embeddings) == 0:
        return np.zeros(512, dtype=np.float32), 0.0

    if len(embeddings) == 1:
        e = embeddings[0].copy()
        norm = np.linalg.norm(e)
        return (e / norm if norm > 1e-8 else e), 1.0

    accepted_count = 1
    running_sum = embeddings[0].copy()
    centroid = running_sum.copy()
    norm = np.linalg.norm(centroid)
    if norm > 1e-8:
        centroid /= norm

    for emb in embeddings[1:]:
        sim = float(emb @ centroid)
        if sim >= _DRIFT_GATE:
            accepted_count += 1
            running_sum += emb
            centroid = running_sum / accepted_count
            norm = np.linalg.norm(centroid)
            if norm > 1e-8:
                centroid /= norm

    rejected = len(embeddings) - accepted_count
    if rejected > 0:
        logger.debug(f"Drift gate rejected {rejected}/{len(embeddings)} embeddings")

    # Coherence = mean similarity of accepted embeddings to final centroid
    sims_sum = 0.0
    accepted_for_coherence = 0
    for i, emb in enumerate(embeddings):
        sim = float(emb @ centroid)
        if sim >= _DRIFT_GATE or i == 0:
            sims_sum += sim
            accepted_for_coherence += 1
    coherence = sims_sum / max(accepted_for_coherence, 1)

    return centroid, coherence


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def merge_tracks_by_identity(tracks: list[dict], video_path: Path, cancel_token=None) -> list[dict]:
    if not _reid_pool or len(tracks) < 2:
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    # 0. Pre-filter: skip tracks too short to embed
    embeddable_indices = [
        i for i, t in enumerate(tracks)
        if len(t["frames"]) >= _MIN_EMBEDDABLE_SAMPLES
    ]
    non_embeddable_indices = [
        i for i in range(len(tracks)) if i not in set(embeddable_indices)
    ]
    if non_embeddable_indices:
        logger.info(
            f"ReID: {len(tracks)} tracks total — "
            f"{len(embeddable_indices)} embeddable, "
            f"{len(non_embeddable_indices)} too short (pass-through)"
        )
    else:
        logger.info(f"ReID: {len(tracks)} tracks — all embeddable")

    if len(embeddable_indices) < 2:
        cap.release()
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    # 1. Adaptive sampling — cap total seeks
    n_embeddable = len(embeddable_indices)
    samples_per_track = max(
        _MIN_EMBEDDABLE_SAMPLES,
        min(_SAMPLES_PER_TRACK, _MAX_TOTAL_SEEKS // n_embeddable),
    )
    if samples_per_track < _SAMPLES_PER_TRACK:
        logger.info(
            f"ReID: adaptive sampling {_SAMPLES_PER_TRACK} → {samples_per_track} "
            f"samples/track ({n_embeddable} embeddable tracks, "
            f"budget={_MAX_TOTAL_SEEKS} seeks)"
        )

    # 2. Plan which frames to sample
    emb_tracks = [tracks[i] for i in embeddable_indices]
    sample_plan: list[list[dict]] = []
    frame_requests: dict[int, list[tuple[int, int]]] = {}

    for ti, t in enumerate(emb_tracks):
        chosen = _pick_sample_frames(t["frames"])[:samples_per_track]
        sample_plan.append(chosen)
        for si, f in enumerate(chosen):
            frame_requests.setdefault(f["frameIndex"], []).append((ti, si))

    # 3. Single sequential video pass → read all crops
    needed_frames = sorted(frame_requests.keys())
    track_crops: list[list[np.ndarray]] = [[] for _ in range(len(emb_tracks))]

    if needed_frames:
        current_pos = -1
        for target_fi in needed_frames:
            if cancel_token and cancel_token.cancelled:
                cap.release()
                raise InterruptedError("Job cancelled")
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
                if kps and _is_profile(kps):
                    continue
                crop = _extract_face_crop(frame, f["bbox"], kps)
                if crop is None:
                    continue
                if _is_blurry(crop):
                    continue
                track_crops[ti].append(crop)

    cap.release()

    if cancel_token and cancel_token.cancelled:
        raise InterruptedError("Job cancelled")

    # 4. Embed all crops in parallel → centroid per track
    centroids: list[np.ndarray | None] = [None] * len(emb_tracks)
    coherences: list[float] = [0.0] * len(emb_tracks)
    valid_local_indices: list[int] = []

    def _embed_track(ti: int) -> tuple[int, np.ndarray | None, float]:
        crops = track_crops[ti]
        if len(crops) < _MIN_EMBEDDABLE_SAMPLES:
            return ti, None, 0.0
        with _ReidLease() as session:
            embs = _embed_crops(session, crops)
        centroid, coherence = _build_centroid(embs)
        return ti, centroid, coherence

    with ThreadPoolExecutor(max_workers=REID_POOL_SIZE) as embed_pool:
        futures = {embed_pool.submit(_embed_track, ti): ti
                   for ti in range(len(emb_tracks))}
        for fut in as_completed(futures):
            ti, centroid, coherence = fut.result()
            centroids[ti] = centroid
            coherences[ti] = coherence
            if centroid is not None and coherence >= _MIN_TRACK_COHERENCE:
                valid_local_indices.append(ti)
            elif centroid is not None:
                logger.debug(
                    f"Track {emb_tracks[ti]['id']}: low coherence {coherence:.3f}, excluded"
                )

    valid_local_indices.sort()

    if len(valid_local_indices) < 2:
        return [{**t, "mergedFrom": [t["id"]]} for t in tracks]

    # 5. Track metadata
    emb_metas = [_track_meta(t) for t in emb_tracks]

    # 6. Pairwise cosine similarity
    valid_centroids = np.stack(
        [centroids[i] for i in valid_local_indices], axis=0
    )  # (M, 512)
    sim_matrix = valid_centroids @ valid_centroids.T  # (M, M), already L2-normed

    candidates: list[tuple[float, int, int]] = []
    M = len(valid_local_indices)
    for ii in range(M):
        i = valid_local_indices[ii]
        mi = emb_metas[i]
        for jj in range(ii + 1, M):
            j = valid_local_indices[jj]
            mj = emb_metas[j]

            # Skip temporal overlap
            if mi["start"] <= mj["end"] and mj["start"] <= mi["end"]:
                if not mi["frame_set"].isdisjoint(mj["frame_set"]):
                    continue

            # Skip mismatched face sizes
            ratio = mi["median_area"] / max(mj["median_area"], 1.0)
            if ratio > _SIZE_RATIO_GATE or ratio < 1.0 / _SIZE_RATIO_GATE:
                continue

            score = float(sim_matrix[ii, jj])
            if score >= REID_THRESHOLD:
                candidates.append((score, i, j))

    candidates.sort(key=lambda x: x[0], reverse=True)
    logger.info(
        f"ReID: {len(valid_local_indices)} embeddable tracks, "
        f"{len(candidates)} merge candidates (threshold={REID_THRESHOLD})"
    )

    # 7. Conflict-aware union-find merge
    n_emb = len(emb_tracks)
    parent = list(range(n_emb))
    group_frames: dict[int, set] = {
        i: emb_metas[i]["frame_set"].copy() for i in range(n_emb)
    }

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

    # 8. Build output
    groups: dict[int, list[int]] = {}
    for i in range(n_emb):
        groups.setdefault(find(i), []).append(i)

    result: list[dict] = []
    new_id = 1
    for indices in sorted(
        groups.values(),
        key=lambda g: -sum(len(emb_tracks[i]["frames"]) for i in g),
    ):
        group_ts = [emb_tracks[i] for i in indices]
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

    for i in non_embeddable_indices:
        t = tracks[i]
        result.append({**t, "mergedFrom": [t["id"]], "id": new_id})
        new_id += 1

    merged_count = len(emb_tracks) - len(
        [g for g in groups.values() if len(g) > 0]
    )
    logger.info(
        f"ReID: {len(tracks)} tracks → {len(result)} identities "
        f"(seeks: {len(needed_frames)}, samples/track: {samples_per_track})"
    )
    return result

