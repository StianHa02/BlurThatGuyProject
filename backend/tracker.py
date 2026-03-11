# tracker.py
# IOU + distance-based face tracker with appearance gating

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

        for det in sorted(detections_per_frame[fi], key=lambda d: -d["score"]):

            best_track = None
            best_score = -1e9

            for t in tracks:

                if t["id"] in used_tracks:
                    continue

                if fi - t["last_frame"] > max_misses:
                    continue

                # Hard scene cut between last observation and now — positions
                # and appearance are meaningless across a cut boundary.
                if _cut_between(t["last_frame"], fi):
                    continue

                iou = _iou(det["bbox"], t["last_box"])
                dist = _center_distance(det["bbox"], t["last_box"])

                gap = fi - t["last_frame"]
                gap_decay = 1.0 / (1.0 + gap * 0.15)

                score = iou

                # fallback distance matching
                if iou < iou_th and dist < max_dist and _similar_size(det["bbox"], t["last_box"]):

                    dist_score = (0.5 - dist * 0.2) * gap_decay

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
# Precompute per-track frame lookups for fast export
# ---------------------------------------------------------------------------

def _precompute_track_lookups(
    tracks_frames: list[list[dict]], total_frames: int
) -> list[dict]:
    """Build a list of {frameIndex: frame_entry} dicts, one per track.

    This allows O(1) lookup during the export loop to check whether a given
    frame index has a detection for each selected track.
    """
    lookups: list[dict] = []
    for frames in tracks_frames:
        lu: dict[int, dict] = {}
        for f in frames:
            lu[f["frameIndex"]] = f
        lookups.append(lu)
    return lookups