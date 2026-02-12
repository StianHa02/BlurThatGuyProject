// lib/faceClient.ts
// Face detection with simple tracking
// Uses browser FaceDetector API or OpenCV Haar Cascade

/* eslint-disable @typescript-eslint/no-explicit-any */

const win = typeof window !== 'undefined' ? (window as any) : null;

let detector: any = null;
let isReady = false;

// NMS (Non-Maximum Suppression) to remove overlapping boxes
function nmsBoxes(
  detections: { bbox: [number, number, number, number]; score: number }[],
  scoreThreshold: number = 0.5,
  nmsThreshold: number = 0.3
): { bbox: [number, number, number, number]; score: number }[] {
  const filtered = detections.filter(d => d.score >= scoreThreshold);
  if (filtered.length === 0) return [];

  filtered.sort((a, b) => b.score - a.score);

  const kept: { bbox: [number, number, number, number]; score: number }[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < filtered.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(filtered[i]);

    for (let j = i + 1; j < filtered.length; j++) {
      if (suppressed.has(j)) continue;
      if (computeIOU(filtered[i].bbox, filtered[j].bbox) > nmsThreshold) {
        suppressed.add(j);
      }
    }
  }
  return kept;
}

// Compute Intersection over Union
function computeIOU(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
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

  const areaA = aw * ah;
  const areaB = bw * bh;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

export async function loadModels(): Promise<void> {
  if (isReady) return;

  // Check if FaceDetector API is available (Chrome 70+)
  if (win && 'FaceDetector' in win) {
    try {
      detector = new win.FaceDetector({ fastMode: false, maxDetectedFaces: 10 });
      isReady = true;
      console.log('Using browser FaceDetector API');
      return;
    } catch (e) {
      console.log('FaceDetector API not available:', e);
    }
  }

  // Fallback: Load OpenCV.js with Haar Cascade
  if (win && !win.cv) {
    console.log('Loading OpenCV.js...');
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.x/opencv.js';
      script.async = true;

      const timeout = setTimeout(() => {
        reject(new Error('OpenCV.js load timeout'));
      }, 60000); // 60 second timeout

      script.onload = () => {
        const checkReady = () => {
          if (win.cv && win.cv.Mat) {
            clearTimeout(timeout);
            console.log('OpenCV.js loaded');
            resolve();
          } else if (win.cv && win.cv.onRuntimeInitialized) {
            win.cv.onRuntimeInitialized = () => {
              clearTimeout(timeout);
              console.log('OpenCV.js runtime initialized');
              resolve();
            };
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load OpenCV.js'));
      };
      document.head.appendChild(script);
    });
  }

  // Load Haar Cascade
  const cv = win.cv;
  const cascadeFile = 'haarcascade_frontalface_default.xml';

  console.log('Loading Haar cascade...');
  const response = await fetch('/models/haarcascade_frontalface_default.xml');
  if (!response.ok) {
    throw new Error('Failed to fetch Haar cascade file');
  }

  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);

  cv.FS_createDataFile('/', cascadeFile, data, true, false, false);

  detector = new cv.CascadeClassifier();
  const loaded = detector.load(cascadeFile);

  if (!loaded) {
    throw new Error('Failed to load Haar cascade classifier');
  }

  isReady = true;
  console.log('OpenCV Haar cascade loaded');
}

// Simple face detection - no tracking complexity
export async function detectFacesInCanvas(
  canvas: HTMLCanvasElement
): Promise<{ bbox: [number, number, number, number]; score: number }[]> {
  if (!isReady || !detector) {
    throw new Error('Face detector not loaded. Call loadModels() first.');
  }

  // Use FaceDetector API if available
  if (win && 'FaceDetector' in win && detector instanceof win.FaceDetector) {
    try {
      const faces = await detector.detect(canvas);
      const detections = faces.map((face: any) => ({
        bbox: [
          face.boundingBox.x,
          face.boundingBox.y,
          face.boundingBox.width,
          face.boundingBox.height
        ] as [number, number, number, number],
        score: 1.0
      }));
      return nmsBoxes(detections, 0.5, 0.3);
    } catch (e) {
      console.error('FaceDetector error:', e);
      return [];
    }
  }

  // Use OpenCV Haar Cascade
  const cv = win.cv;

  try {
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Enhance contrast for better detection
    cv.equalizeHist(gray, gray);

    const faces = new cv.RectVector();
    const msize = new cv.Size(30, 30);

    // detectMultiScale params: scaleFactor, minNeighbors, flags, minSize
    detector.detectMultiScale(gray, faces, 1.1, 3, 0, msize);

    const results: { bbox: [number, number, number, number]; score: number }[] = [];

    for (let i = 0; i < faces.size(); i++) {
      const face = faces.get(i);
      results.push({
        bbox: [face.x, face.y, face.width, face.height],
        score: 1.0
      });
    }

    src.delete();
    gray.delete();
    faces.delete();

    return nmsBoxes(results, 0.5, 0.3);
  } catch (error) {
    console.error('OpenCV face detection error:', error);
    return [];
  }
}

// Reset function (kept for compatibility)
export function resetTrackers(): void {
  // No-op now since we removed complex tracking
}

// Extract a face thumbnail from canvas
export function extractFaceThumbnail(
  canvas: HTMLCanvasElement,
  bbox: [number, number, number, number],
  size: number = 100
): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const [fx, fy, fw, fh] = bbox;

  // Add padding around face (30%)
  const padding = 0.3;
  const px = Math.max(0, fx - fw * padding);
  const py = Math.max(0, fy - fh * padding);
  const pw = Math.min(fw * (1 + padding * 2), canvas.width - px);
  const ph = Math.min(fh * (1 + padding * 2), canvas.height - py);

  if (pw <= 0 || ph <= 0) return null;

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = size;
  thumbCanvas.height = size;
  const thumbCtx = thumbCanvas.getContext('2d');

  if (!thumbCtx) return null;

  try {
    thumbCtx.drawImage(canvas, px, py, pw, ph, 0, 0, size, size);
    return thumbCanvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    return null;
  }
}

// Simple color histogram for face comparison
export function getFaceHistogram(
  canvas: HTMLCanvasElement,
  bbox: [number, number, number, number]
): number[] | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const [fx, fy, fw, fh] = bbox;
  const x = Math.max(0, Math.floor(fx));
  const y = Math.max(0, Math.floor(fy));
  const w = Math.min(Math.floor(fw), canvas.width - x);
  const h = Math.min(Math.floor(fh), canvas.height - y);

  if (w <= 0 || h <= 0) return null;

  try {
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    // Simple histogram with 16 bins per channel (RGB)
    const bins = 16;
    const histogram = new Array(bins * 3).fill(0);

    for (let i = 0; i < data.length; i += 4) {
      const r = Math.floor(data[i] / (256 / bins));
      const g = Math.floor(data[i + 1] / (256 / bins));
      const b = Math.floor(data[i + 2] / (256 / bins));

      histogram[r]++;
      histogram[bins + g]++;
      histogram[bins * 2 + b]++;
    }

    // Normalize
    const total = data.length / 4;
    for (let i = 0; i < histogram.length; i++) {
      histogram[i] /= total;
    }

    return histogram;
  } catch (e) {
    return null;
  }
}

// Compare two histograms (returns similarity 0-1)
export function compareHistograms(h1: number[], h2: number[]): number {
  if (!h1 || !h2 || h1.length !== h2.length) return 0;

  // Bhattacharyya coefficient
  let sum = 0;
  for (let i = 0; i < h1.length; i++) {
    sum += Math.sqrt(h1[i] * h2[i]);
  }

  return sum;
}
