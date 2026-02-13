// lib/faceClient.ts
// Face detection using Python backend with OpenCV DNN (YuNet)

const API_URL = 'http://localhost:8000';

let isReady = false;

export async function loadModels(): Promise<void> {
  if (isReady) return;

  // Check if backend is running
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) {
      throw new Error('Backend not responding');
    }
    const data = await response.json();
    console.log(`Connected to backend: ${data.model}`);
    isReady = true;
  } catch (error) {
    throw new Error(
      'Failed to connect to face detection backend. Make sure the Python server is running on port 8000.'
    );
  }
}

export async function detectFacesInCanvas(
  canvas: HTMLCanvasElement
): Promise<{ bbox: [number, number, number, number]; score: number }[]> {
  if (!isReady) {
    throw new Error('Face detector not loaded. Call loadModels() first.');
  }

  // Convert canvas to base64
  const imageData = canvas.toDataURL('image/jpeg', 0.9);

  try {
    const response = await fetch(`${API_URL}/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: imageData }),
    });

    if (!response.ok) {
      throw new Error(`Detection failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.faces.map((face: { bbox: number[]; score: number }) => ({
      bbox: face.bbox as [number, number, number, number],
      score: face.score,
    }));
  } catch (error) {
    console.error('Face detection error:', error);
    return [];
  }
}

export function resetTrackers(): void {
  // No-op - tracking state is managed in tracker.ts
}
