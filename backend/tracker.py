# tracker.py
# IOU + distance-based face tracker.
#
# NOTE: track_detections() mirrors lib/tracker.ts → trackDetections() exactly:
#   same algorithm, same default constants (iouThreshold=0.2, maxMisses=20,
#   minTrackLength=5, maxCenterDistance=2.0), same match-score formula, and
#   the same miss-increment logic.  Any change here must be reflected in
#   tracker.ts and vice-versa.

# ---------------------------------------------------------------------------
# Config (kept in sync with main.py TRACKER_CONFIG)
# ---------------------------------------------------------------------------

TRACKER_CONFIG = {
    "iou_threshold": 0.2,
    "max_misses": 20,
    "min_track_length": 5,
    "max_center_distance": 2.0,
}

# ---------------------------------------------------------------------------
# Low-level geometry helpers
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
    return (
        ((ax + aw / 2 - bx - bw / 2) ** 2 + (ay + ah / 2 - by - bh / 2) ** 2) ** 0.5 / avg
        if avg > 0
        else 9999.0
    )


def _similar_size(a, b) -> bool:
    return 0.5 < (a[2] * a[3]) / (b[2] * b[3]) < 2.0 if b[2] * b[3] else False


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------

def track_detections(detections_per_frame: dict) -> list[dict]:
    """IOU + distance tracker — mirrors tracker.ts trackDetections() exactly."""
    iou_th = TRACKER_CONFIG["iou_threshold"]
    max_misses = TRACKER_CONFIG["max_misses"]
    min_len = TRACKER_CONFIG["min_track_length"]
    max_dist = TRACKER_CONFIG["max_center_distance"]
    tracks, next_id = [], 1

    for fi in sorted(detections_per_frame):
        used = set()
        for det in sorted(detections_per_frame[fi], key=lambda d: -d["score"]):
            best, best_score = None, -float("inf")
            for t in tracks:
                if t["id"] in used or fi - t["last_frame"] > max_misses + 1:
                    continue
                iou = _iou(det["bbox"], t["last_box"])
                dist = _center_distance(det["bbox"], t["last_box"])
                score = max(
                    iou,
                    0.5 - dist * 0.2
                    if iou < iou_th and dist < max_dist and _similar_size(det["bbox"], t["last_box"])
                    else -1,
                )
                if score > best_score:
                    best_score, best = score, t
            if best and best_score >= iou_th:
                best["frames"].append(
                    {"frameIndex": fi, "bbox": det["bbox"], "score": det["score"]}
                )
                best["last_box"], best["last_frame"] = det["bbox"], fi
                used.add(best["id"])
            else:
                t = {
                    "id": next_id,
                    "frames": [{"frameIndex": fi, "bbox": det["bbox"], "score": det["score"]}],
                    "last_box": det["bbox"],
                    "last_frame": fi,
                    "misses": 0,
                }
                next_id += 1
                tracks.append(t)
                used.add(t["id"])
        for t in tracks:
            if t["last_frame"] < fi:
                t["misses"] += 1

    result = []
    for t in tracks:
        if len(t["frames"]) < min_len:
            continue
        mid = len(t["frames"]) // 2
        result.append(
            {
                "id": t["id"],
                "frames": t["frames"],
                "startFrame": t["frames"][0]["frameIndex"],
                "endFrame": t["frames"][-1]["frameIndex"],
                "thumbnailFrameIndex": t["frames"][mid]["frameIndex"],
            }
        )
    return sorted(result, key=lambda t: -len(t["frames"]))


# ---------------------------------------------------------------------------
# Detection-store helpers (used by main.py endpoints)
# ---------------------------------------------------------------------------

def _find_detection(frames: list, frame_idx: int) -> dict | None:
    """Binary search + interpolation. Matches frontend PlayerWithMask logic exactly."""
    if not frames:
        return None
    if frame_idx < frames[0]["frameIndex"] - 20 or frame_idx > frames[-1]["frameIndex"] + 20:
        return None
    left, right = 0, len(frames) - 1
    while left <= right:
        mid = (left + right) // 2
        if frames[mid]["frameIndex"] == frame_idx:
            return frames[mid]
        elif frames[mid]["frameIndex"] < frame_idx:
            left = mid + 1
        else:
            right = mid - 1
    prev_f = frames[left - 1] if left > 0 else None
    next_f = frames[left] if left < len(frames) else None
    if prev_f and not next_f:
        return prev_f if (frame_idx - prev_f["frameIndex"]) <= 8 else None
    if next_f and not prev_f:
        return next_f if (next_f["frameIndex"] - frame_idx) <= 8 else None
    if prev_f and next_f:
        gap = next_f["frameIndex"] - prev_f["frameIndex"]
        if gap > 20:
            return None
        t = (frame_idx - prev_f["frameIndex"]) / gap
        pb, nb = prev_f["bbox"], next_f["bbox"]
        return {
            "frameIndex": frame_idx,
            "bbox": [pb[i] + (nb[i] - pb[i]) * t for i in range(4)],
            "score": prev_f["score"] * (1 - t) + next_f["score"] * t,
        }
    return None


def _precompute_track_lookups(tracks_frames_list: list, total_frames: int) -> list[dict]:
    """Pre-build {frameIndex: detection} dicts for O(1) lookup during blur."""
    if total_frames <= 0:
        return [{} for _ in tracks_frames_list]
    lookups = []
    for frames in tracks_frames_list:
        lookup = {}
        if frames:
            start = max(0, int(frames[0]["frameIndex"]) - 20)
            end = min(total_frames - 1, int(frames[-1]["frameIndex"]) + 20)
            for fi in range(start, end + 1):
                det = _find_detection(frames, fi)
                if det is not None:
                    lookup[fi] = det
        lookups.append(lookup)
    return lookups