import type { BBox } from '@/types';

export function frameToTime(frameIndex: number, fps: number): number {
  return frameIndex / (fps > 0 ? fps : 30);
}

export function padBBox(
  bbox: BBox,
  padding: number,
  maxWidth: number,
  maxHeight: number
): { x: number; y: number; w: number; h: number } {
  const [ox, oy, ow, oh] = bbox;
  const x = Math.max(0, ox - ow * padding);
  const y = Math.max(0, oy - oh * padding);
  const w = Math.min(ow * (1 + padding * 2), maxWidth - x);
  const h = Math.min(oh * (1 + padding * 2), maxHeight - y);
  return { x, y, w, h };
}

export function isBlackFrame(ctx: CanvasRenderingContext2D, size: number): boolean {
  const data = ctx.getImageData(0, 0, size, size).data;
  for (let i = 0; i < data.length; i += 400) {
    if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) return false;
  }
  return true;
}
