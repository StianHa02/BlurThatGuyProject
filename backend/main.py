# Face Detection API with OpenCV DNN (YuNet)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2
import numpy as np
import base64
from pathlib import Path
import urllib.request

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


@app.get("/health")
async def health():
    return {"status": "ok", "model": "YuNet"}


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
