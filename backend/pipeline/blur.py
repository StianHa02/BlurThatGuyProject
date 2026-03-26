import cv2
import numpy as np


def _blur_frame(args: tuple) -> tuple[int, np.ndarray]:
    idx, frame, track_lookup_dicts, padding, target_blocks, width, height, blur_mode = args
    for lookup in track_lookup_dicts:
        det = lookup.get(int(idx))
        if det is None:
            continue
        ox, oy, ow, oh = det["bbox"]
        x = max(0, int(ox - ow * padding))
        y = max(0, int(oy - oh * padding))
        w = min(int(ow * (1 + padding * 2)), width - x)
        h = min(int(oh * (1 + padding * 2)), height - y)
        if w > 0 and h > 0:
            region = frame[y:y + h, x:x + w]
            # Ellipse mask: only anonymise the face oval, not the full bounding box
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.ellipse(mask, (w // 2, h // 2), (w // 2, h // 2), 0, 0, 360, 255, -1)
            if blur_mode == "blackout":
                replacement = np.zeros_like(region)
            else:
                # Adaptive block size: same block density regardless of face size.
                # Minimum 6px so pixelation is always visible even on small faces.
                block_size = max(6, min(w, h) // target_blocks)
                small = cv2.resize(
                    region,
                    (max(1, w // block_size), max(1, h // block_size)),
                    interpolation=cv2.INTER_LINEAR,
                )
                replacement = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
            frame[y:y + h, x:x + w] = np.where(mask[:, :, np.newaxis], replacement, region)
    return (idx, frame)