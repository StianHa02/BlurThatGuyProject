# tracker.py
# IOU + distance-based face tracker with appearance gating

import bisect
import numpy as np

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TRACKER_CONFIG = {
    "iou_threshold": 0.2,
    "max_misses": 12,
    "min_track_length": 5,
    "max_center_distance": 1.5,
}

APPEARANCE_THRESHOLD = 0.45

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _iou(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    iw = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    ih = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    union = aw * ah + bw * bh - iw * ih
    return (iw * ih) / union if union > 0 else 0.0


def _center_distance(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    avg = (aw + ah + bw + bh) / 4
    if avg <= 0:
        return 9999.0
    return (((ax + aw/2 - bx - bw/2)**2 + (ay + ah/2 - by - bh/2)**2)**0.5) / avg


def _similar_size(a, b) -> bool:
    area_b = b[2] * b[3]
    if area_b <= 0:
        return False
    return 0.6 < (a[2] * a[3]) / area_b < 1.67


def _cosine(a, b) -> float:
    """Safe cosine similarity."""
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


# ---------------------------------------------------------------------------
# Vectorized geometry for batch track-vs-detection scoring
# ---------------------------------------------------------------------------

def _batch_iou(track_boxes: np.ndarray, det_box: np.ndarray) -> np.ndarray:
    """Compute IoU of (N, 4) xywh track boxes against a single (4,) det box.
    Returns (N,) array of IoU values."""
    tx, ty, tw, th = track_boxes[:, 0], track_boxes[:, 1], track_boxes[:, 2], track_boxes[:, 3]
    dx, dy, dw, dh = det_box
    iw = np.maximum(0.0, np.minimum(tx + tw, dx + dw) - np.maximum(tx, dx))
    ih = np.maximum(0.0, np.minimum(ty + th, dy + dh) - np.maximum(ty, dy))
    inter = iw * ih
    union = tw * th + dw * dh - inter
    return np.where(union > 0, inter / union, 0.0)


def _batch_center_dist(track_boxes: np.ndarray, det_box: np.ndarray) -> np.ndarray:
    """Normalized center distance of (N, 4) track boxes vs single (4,) det box.
    Returns (N,) array."""
    tx, ty, tw, th = track_boxes[:, 0], track_boxes[:, 1], track_boxes[:, 2], track_boxes[:, 3]
    dx, dy, dw, dh = det_box
    avg = (tw + th + dw + dh) / 4.0
    avg = np.maximum(avg, 1e-8)
    cx_diff = tx + tw / 2 - dx - dw / 2
    cy_diff = ty + th / 2 - dy - dh / 2
    return np.sqrt(cx_diff ** 2 + cy_diff ** 2) / avg


def _batch_similar_size(track_boxes: np.ndarray, det_box: np.ndarray) -> np.ndarray:
    """Check area ratio within [0.6, 1.67]. Returns (N,) bool array."""
    t_area = track_boxes[:, 2] * track_boxes[:, 3]
    d_area = det_box[2] * det_box[3]
    ratio = np.where(d_area > 0, t_area / d_area, 0.0)
    return (ratio > 0.6) & (ratio < 1.67)


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------

def track_detections(detections_per_frame: dict, cut_frames: set[int] | None = None) -> list[dict]:

    iou_th = TRACKER_CONFIG["iou_threshold"]
    max_misses = TRACKER_CONFIG["max_misses"]
    min_len = TRACKER_CONFIG["min_track_length"]
    max_dist = TRACKER_CONFIG["max_center_distance"]

    # Pre-sort cuts once into a list so we can use bisect for O(log n) range
    # queries instead of scanning the entire set for every track candidate.
    import bisect
    cuts_sorted = sorted(cut_frames) if cut_frames else []

    def _cut_between(a: int, b: int) -> bool:
        """Return True if any cut frame index falls in the range (a, b]."""
        if not cuts_sorted:
            return False
        idx = bisect.bisect_right(cuts_sorted, a)
        return idx < len(cuts_sorted) and cuts_sorted[idx] <= b

    tracks = []
    next_id = 1

    for fi in sorted(detections_per_frame):

        used_tracks = set()

        # Pre-filter active tracks for this frame
        active_tracks = [t for t in tracks if fi - t["last_frame"] <= max_misses]

        # Initialize vectorized arrays (used inside the detection loop)
        track_boxes = np.empty((0, 4), dtype=np.float64)
        track_last_frames = np.empty(0, dtype=np.int64)
        cut_mask = np.empty(0, dtype=bool)

        if active_tracks and detections_per_frame[fi]:
            # Build (N, 4) array of active track boxes for vectorized matching
            track_boxes = np.array([t["last_box"] for t in active_tracks], dtype=np.float64)
            track_last_frames = np.array([t["last_frame"] for t in active_tracks])

            # Pre-compute cut masks: for each active track, check if there's a
            # cut between its last_frame and fi
            if cuts_sorted:
                cut_mask = np.array([_cut_between(t["last_frame"], fi) for t in active_tracks])
            else:
                cut_mask = np.zeros(len(active_tracks), dtype=bool)

        for det in sorted(detections_per_frame[fi], key=lambda d: -d["score"]):

            best_track = None
            best_score = -1e9

            if not active_tracks:
                pass  # skip to new-track creation below
            else:
                det_box = np.array(det["bbox"], dtype=np.float64)
                # Vectorized IoU and distance for ALL active tracks at once
                ious = _batch_iou(track_boxes, det_box)
                dists = _batch_center_dist(track_boxes, det_box)
                sim_sizes = _batch_similar_size(track_boxes, det_box)
                gaps = fi - track_last_frames
                gap_decays = 1.0 / (1.0 + gaps * 0.15)

                for ti, t in enumerate(active_tracks):

                    if t["id"] in used_tracks:
                        continue

                    # Skip tracks across scene cuts
                    if cut_mask[ti]:
                        continue

                    iou = float(ious[ti])
                    dist = float(dists[ti])

                    score = iou

                    # fallback distance matching
                    if iou < iou_th and dist < max_dist and sim_sizes[ti]:

                        dist_score = (0.5 - dist * 0.2) * float(gap_decays[ti])

                        # appearance gate ONLY for fallback matching
                        det_emb = det.get("emb")
                        t_centroid = t.get("centroid")

                        if det_emb is not None and t_centroid is not None:
                            sim = _cosine(det_emb, t_centroid)
                            if sim < APPEARANCE_THRESHOLD:
                                continue

                        score = max(score, dist_score)

                    if score > best_score:
                        best_score = score
                        best_track = t

            if best_track and best_score >= iou_th:

                frame_entry = {
                    "frameIndex": fi,
                    "bbox": det["bbox"],
                    "score": det["score"]
                }

                if "kps" in det:
                    frame_entry["kps"] = det["kps"]

                best_track["frames"].append(frame_entry)
                best_track["last_box"] = det["bbox"]
                best_track["last_frame"] = fi

                # update appearance centroid
                det_emb = det.get("emb")
                if det_emb is not None:

                    if best_track["centroid"] is None:
                        best_track["centroid"] = det_emb.copy()
                        best_track["emb_count"] = 1
                    else:
                        c = best_track["centroid"]
                        n = best_track["emb_count"]

                        new_c = (c * n + det_emb) / (n + 1)
                        best_track["centroid"] = new_c
                        best_track["emb_count"] = n + 1

                used_tracks.add(best_track["id"])

            else:

                frame_entry = {
                    "frameIndex": fi,
                    "bbox": det["bbox"],
                    "score": det["score"]
                }

                if "kps" in det:
                    frame_entry["kps"] = det["kps"]

                tracks.append({
                    "id": next_id,
                    "frames": [frame_entry],
                    "last_box": det["bbox"],
                    "last_frame": fi,
                    "centroid": det.get("emb"),
                    "emb_count": 1 if det.get("emb") is not None else 0
                })

                used_tracks.add(next_id)
                next_id += 1

    # -----------------------------------------------------------------------
    # finalize tracks
    # -----------------------------------------------------------------------

    result = []

    for t in tracks:

        if len(t["frames"]) < min_len:
            continue

        mid = len(t["frames"]) // 2

        result.append({
            "id": t["id"],
            "frames": t["frames"],
            "startFrame": t["frames"][0]["frameIndex"],
            "endFrame": t["frames"][-1]["frameIndex"],
            "thumbnailFrameIndex": t["frames"][mid]["frameIndex"],
        })

    return sorted(result, key=lambda t: -len(t["frames"]))


# ---------------------------------------------------------------------------
# Lazy per-track frame lookups for export (gap-aware interpolation)
# ---------------------------------------------------------------------------

class TrackLookup:
    """Lazy per-frame bbox lookup with linear interpolation between detections.

    Stores only the original detection keyframes in sorted order.
    On __contains__/get, uses bisect to find surrounding keyframes and
    interpolates the bbox in O(log n) time.

    Gap-aware: refuses to interpolate when the distance between two
    consecutive detections exceeds max_gap. This prevents blur from
    bleeding across scene cuts where ReID merged track fragments.
    """
    __slots__ = ('_indices', '_by_idx', '_max_gap')

    def __init__(self, frames: list[dict], max_gap: int = 36):
        sorted_frames = sorted(frames, key=lambda f: f["frameIndex"])
        self._indices = [f["frameIndex"] for f in sorted_frames]
        self._by_idx = {f["frameIndex"]: f for f in sorted_frames}
        self._max_gap = max_gap

    def __contains__(self, fi: int) -> bool:
        return self.get(fi) is not None

    def get(self, fi: int) -> dict | None:
        if not self._indices:
            return None
        exact = self._by_idx.get(fi)
        if exact is not None:
            return exact
        if fi < self._indices[0] or fi > self._indices[-1]:
            return None
        idx = bisect.bisect_right(self._indices, fi)
        fi0 = self._indices[idx - 1]
        fi1 = self._indices[idx]
        # Don't interpolate across large gaps (scene cuts / long absences)
        if fi1 - fi0 > self._max_gap:
            return None
        f0 = self._by_idx[fi0]
        f1 = self._by_idx[fi1]
        t = (fi - fi0) / (fi1 - fi0)
        b0, b1 = f0["bbox"], f1["bbox"]
        return {
            "frameIndex": fi,
            "bbox": [b0[j] + t * (b1[j] - b0[j]) for j in range(4)],
            "score": f0["score"],
        }


def _precompute_track_lookups(
    tracks_frames: list[list[dict]], total_frames: int, max_gap: int = 36
) -> list[TrackLookup]:
    """Build lazy lookup objects, one per track.

    max_gap: maximum frame distance to interpolate across. Gaps larger than
    this (e.g. scene cuts) are left unblurred. Default 36 = max_misses(12)
    * sample_rate(3).
    """
    return [TrackLookup(frames, max_gap) for frames in tracks_frames]