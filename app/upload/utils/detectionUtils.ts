import type { BBox, Detection } from '@/types';

export function findDetectionForFrame(
  frames: Detection[],
  frameIndex: number
): { bbox: BBox; score: number } | null {
  if (!frames || frames.length === 0) return null;

  // Binary search for the interval containing frameIndex
  let left = 0;
  let right = frames.length - 1;

  if (frameIndex < frames[0].frameIndex - 20) return null;
  if (frameIndex > frames[frames.length - 1].frameIndex + 20) return null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (frames[mid].frameIndex === frameIndex) {
      return { bbox: frames[mid].bbox, score: frames[mid].score };
    }
    if (frames[mid].frameIndex < frameIndex) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  // If not found, left is the index of the first element greater than frameIndex
  const prev = frames[left - 1];
  const next = frames[left];

  const maxGap = 20; // Match tracker maxMisses

  // No padding for first/last detections to avoid "ghost" masks.
  const edgePadding = 0;

  if (prev && !next) {
    return (frameIndex - prev.frameIndex <= edgePadding) ? { bbox: prev.bbox, score: prev.score } : null;
  }
  if (!prev && next) {
    return (next.frameIndex - frameIndex <= edgePadding) ? { bbox: next.bbox, score: next.score } : null;
  }

  if (prev && next) {
    const gap = next.frameIndex - prev.frameIndex;
    if (gap > maxGap) {
      if (frameIndex === prev.frameIndex) return { bbox: prev.bbox, score: prev.score };
      if (frameIndex === next.frameIndex) return { bbox: next.bbox, score: next.score };
      return null;
    }

    // Interpolate
    const t = (frameIndex - prev.frameIndex) / gap;
    return {
      bbox: [
        prev.bbox[0] + (next.bbox[0] - prev.bbox[0]) * t,
        prev.bbox[1] + (next.bbox[1] - prev.bbox[1]) * t,
        prev.bbox[2] + (next.bbox[2] - prev.bbox[2]) * t,
        prev.bbox[3] + (next.bbox[3] - prev.bbox[3]) * t,
      ],
      score: prev.score * (1 - t) + next.score * t
    };
  }

  return null;
}
