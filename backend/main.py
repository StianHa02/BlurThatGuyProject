# Face Detection API with OpenCV DNN (YuNet)

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import cv2
import numpy as np
import base64
from pathlib import Path
import urllib.request
import tempfile
import os
import uuid

app = FastAPI(title="Face Detection API")

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global face detector
face_detector = None
MODELS_DIR = Path(__file__).parent / "models"


def download_yunet_model():
    """Download YuNet model if not present"""
    MODELS_DIR.mkdir(exist_ok=True)
    model_path = MODELS_DIR / "face_detection_yunet_2023mar.onnx"

    if not model_path.exists():
        print("Downloading YuNet model...")
        url = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        urllib.request.urlretrieve(url, model_path)
        print("YuNet model downloaded")

    return str(model_path)


def get_face_detector(width: int = 640, height: int = 480):
    """Get or create face detector with specified input size"""
    global face_detector

    model_path = download_yunet_model()

    face_detector = cv2.FaceDetectorYN.create(
        model_path,
        "",
        (width, height),
        score_threshold=0.5,
        nms_threshold=0.3,
        top_k=5000
    )

    return face_detector


@app.on_event("startup")
async def startup_event():
    """Initialize face detector on startup"""
    get_face_detector()
    print("Face detector initialized with YuNet model")


def detect_faces(image: np.ndarray) -> list[dict]:
    """
    Detect faces in an image using YuNet
    Returns list of face detections with bbox and confidence
    """
    global face_detector

    height, width = image.shape[:2]

    # Update input size if needed
    face_detector.setInputSize((width, height))

    # Detect faces
    _, faces = face_detector.detect(image)

    results = []
    if faces is not None:
        for face in faces:
            # YuNet returns: x, y, w, h, landmarks (10 values), confidence
            x, y, w, h = face[:4].astype(int)
            confidence = float(face[14])

            results.append({
                "bbox": [int(x), int(y), int(w), int(h)],
                "score": confidence,
            })

    return results


class ImageRequest(BaseModel):
    image: str  # base64 encoded image


class ExportRequest(BaseModel):
    tracks: list[dict]  # List of tracks with frames containing bbox data
    selectedTrackIds: list[int]  # IDs of tracks to blur
    padding: float = 0.4  # Padding around face
    blurAmount: int = 12  # Pixelation amount


# Store for temporary files
TEMP_DIR = Path(tempfile.gettempdir()) / "blurthatguy"
TEMP_DIR.mkdir(exist_ok=True)


@app.get("/health")
async def health():
    return {"status": "ok", "model": "YuNet"}


@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file and return an ID for later processing"""
    video_id = str(uuid.uuid4())
    video_path = TEMP_DIR / f"{video_id}.mp4"

    with open(video_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"videoId": video_id}


@app.post("/export/{video_id}")
async def export_video(video_id: str, request: ExportRequest):
    """Process video with blurred faces and return the result"""
    input_path = TEMP_DIR / f"{video_id}.mp4"

    if not input_path.exists():
        raise HTTPException(status_code=404, detail="Video not found. Please upload again.")

    output_path = TEMP_DIR / f"{video_id}_blurred.mp4"

    try:
        # Build lookup for selected tracks
        tracks_map = {t["id"]: t for t in request.tracks if t["id"] in request.selectedTrackIds}

        # Open video
        cap = cv2.VideoCapture(str(input_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Create video writer with H.264 codec
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Apply blur to faces in selected tracks
            for track_id, track in tracks_map.items():
                det = find_detection_for_frame(track["frames"], frame_idx)
                if det is None:
                    continue

                bbox = det["bbox"]
                ox, oy, ow, oh = bbox
                padding = request.padding

                x = max(0, int(ox - ow * padding))
                y = max(0, int(oy - oh * padding))
                w = min(int(ow * (1 + padding * 2)), width - x)
                h = min(int(oh * (1 + padding * 2)), height - y)

                if w > 0 and h > 0:
                    # Extract face region
                    face_region = frame[y:y+h, x:x+w]

                    # Pixelate by downscaling and upscaling
                    blur_amt = request.blurAmount
                    small = cv2.resize(face_region, (max(1, w // blur_amt), max(1, h // blur_amt)), interpolation=cv2.INTER_LINEAR)
                    pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)

                    # Put back
                    frame[y:y+h, x:x+w] = pixelated

            out.write(frame)
            frame_idx += 1

        cap.release()
        out.release()

        return FileResponse(
            str(output_path),
            media_type="video/mp4",
            filename="blurred-video.mp4"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def find_detection_for_frame(frames: list, frame_idx: int) -> dict | None:
    """Find the closest detection for a given frame index"""
    if not frames:
        return None

    best = None
    best_diff = float('inf')

    for f in frames:
        diff = abs(f["frameIndex"] - frame_idx)
        if diff < best_diff:
            best_diff = diff
            best = f

    return best if best_diff <= 15 else None


@app.post("/detect")
async def detect_endpoint(request: ImageRequest):
    """Detect faces in a base64-encoded image"""
    try:
        # Remove data URL prefix if present
        image_data = request.image
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        # Decode base64 to image
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Failed to decode image")

        # Detect faces
        faces = detect_faces(image)

        return {"faces": faces}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
