import type { BBox, Detection, Track } from '@/types';
export type { BBox, Detection, Track };

// Calculate IOU (Intersection over Union)
function iou(a: BBox, b: BBox) {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const ax2 = ax + aw;
  const ay2 = ay + ah;
  const bx2 = bx + bw;
  const by2 = by + bh;

  const ix1 = Math.max(ax, bx);
  const iy1 = Math.max(ay, by);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const union = aw * ah + bw * bh - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

// Calculate center distance between two boxes (normalized by box size)
function centerDistance(a: BBox, b: BBox): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;

  const aCenterX = ax + aw / 2;
  const aCenterY = ay + ah / 2;
  const bCenterX = bx + bw / 2;
  const bCenterY = by + bh / 2;

  const dx = aCenterX - bCenterX;
  const dy = aCenterY - bCenterY;

  // Normalize by average box size
  const avgSize = (aw + ah + bw + bh) / 4;

  return Math.sqrt(dx * dx + dy * dy) / avgSize;
}

// Check if boxes are similar in size (within 50% difference)
function similarSize(a: BBox, b: BBox): boolean {
  const [, , aw, ah] = a;
  const [, , bw, bh] = b;

  const areaA = aw * ah;
  const areaB = bw * bh;

  const ratio = areaA / areaB;
  return ratio > 0.6 && ratio < 1.67;
}

export function trackDetections(
  detectionsPerFrame: Record<number, { bbox: BBox; score: number }[]>,
  opts?: { iouThreshold?: number; maxMisses?: number; minTrackLength?: number }
): Track[] {
  const iouThreshold = opts?.iouThreshold ?? 0.2;
  const maxMisses = opts?.maxMisses ?? 12;
  const minTrackLength = opts?.minTrackLength ?? 5;

  // Distance threshold - if centers are within 1.5x box size, consider same track
  const maxCenterDistance = 1.5;

  type InternalTrack = {
    id: number;
    frames: Detection[];
    lastBox: BBox;
    lastFrame: number;
    misses: number;
  };

  const tracks: InternalTrack[] = [];
  let nextId = 1;

  const frameIndices = Object.keys(detectionsPerFrame)
    .map(k => parseInt(k, 10))
    .sort((a, b) => a - b);

  for (const frameIndex of frameIndices) {
    const detections = detectionsPerFrame[frameIndex] || [];
    const usedTracks = new Set<number>();

    // Sort detections by score (highest first)
    const sortedDets = [...detections].sort((a, b) => b.score - a.score);

    for (const det of sortedDets) {
      let bestTrack: InternalTrack | null = null;
      let bestScore = -Infinity;

      for (const t of tracks) {
        // Skip if track already matched this frame
        if (usedTracks.has(t.id)) continue;

        // Skip if track has been missing too long
        if (frameIndex - t.lastFrame > maxMisses + 1) continue;

        const iouVal = iou(det.bbox, t.lastBox);
        const distVal = centerDistance(det.bbox, t.lastBox);
        const sizeMatch = similarSize(det.bbox, t.lastBox);

        // Frame gap decay: the longer a track is unseen, the harder
        // it is to match via distance.  Prevents stale tracks from
        // grabbing a new person who walks into a nearby position.
        const gap = frameIndex - t.lastFrame;
        const gapDecay = 1.0 / (1.0 + gap * 0.15);

        // IOU is unaffected by gap (still reliable for overlap)
        let score = iouVal;

        if (iouVal < iouThreshold && distVal < maxCenterDistance && sizeMatch) {
          // Distance-based fallback, penalised by how stale the track is
          const distScore = (0.5 - distVal * 0.2) * gapDecay;
          score = Math.max(score, distScore);
        }

        if (score > bestScore) {
          bestScore = score;
          bestTrack = t;
        }
      }

      // Match if IOU threshold met OR if distance-based matching works
      if (bestTrack && bestScore >= iouThreshold) {
        bestTrack.frames.push({ frameIndex, bbox: det.bbox, score: det.score });
        bestTrack.lastBox = det.bbox;
        bestTrack.lastFrame = frameIndex;
        bestTrack.misses = 0;
        usedTracks.add(bestTrack.id);
      } else {
        // Create new track
        const t: InternalTrack = {
          id: nextId++,
          frames: [{ frameIndex, bbox: det.bbox, score: det.score }],
          lastBox: det.bbox,
          lastFrame: frameIndex,
          misses: 0
        };
        tracks.push(t);
        usedTracks.add(t.id);
      }
    }

    // Increment misses for tracks not matched this frame
    for (const t of tracks) {
      if (t.lastFrame < frameIndex) {
        t.misses++;
      }
    }
  }

  return tracks
    .map(t => {
      const startFrame = t.frames[0].frameIndex;
      const endFrame = t.frames[t.frames.length - 1].frameIndex;
      return {
        id: t.id,
        frames: t.frames,
        startFrame,
        endFrame,
        thumbnailFrameIndex: t.frames[Math.floor(t.frames.length / 2)].frameIndex
      } as Track;
    })
    .filter(t => t.frames.length >= minTrackLength);
}