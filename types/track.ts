export type BBox = [number, number, number, number]; // x,y,w,h

export interface Detection {
  frameIndex: number;
  bbox: BBox;
  score: number;
}

export interface Track {
  id: number;
  frames: Detection[];
  startFrame: number;
  endFrame: number;
  thumbnailFrameIndex: number;
  mergedFrom?: number[];
}
