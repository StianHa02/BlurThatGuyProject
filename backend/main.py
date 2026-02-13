# Face Detection API with OpenCV DNN (YuNet)
# Security-hardened version

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
import cv2
import numpy as np
import base64
from pathlib import Path
import urllib.request
import tempfile
import os
import uuid
import re
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Any

# =============================================================================
# Configuration Constants
# =============================================================================

FACE_DETECTION_CONFIG = {
    "score_threshold": 0.5,
    "nms_threshold": 0.3,
    "max_faces": 5000,
}

VIDEO_PROCESSING_CONFIG = {
    "default_padding": 0.4,
    "default_blur_amount": 12,
    "max_padding": 2.0,
    "max_blur_amount": 50,
    "min_blur_amount": 1,
}

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}

# =============================================================================
# Logging Setup
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# =============================================================================
# Environment Variable Validation
# =============================================================================

def validate_environment() -> None:
    """Validate required environment variables on startup"""
    api_key = os.environ.get("API_KEY", "")
    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "")
    max_upload_mb = os.environ.get("MAX_UPLOAD_SIZE_MB", "100")

    warnings = []

    if not api_key:
        warnings.append("WARNING: API_KEY not set - API will be unprotected!")

    if not allowed_origins:
        warnings.append("WARNING: ALLOWED_ORIGINS not set - using localhost only")

    try:
        max_size = int(max_upload_mb)
        if max_size < 1 or max_size > 500:
            warnings.append(f"WARNING: MAX_UPLOAD_SIZE_MB={max_size} is outside reasonable range (1-500)")
    except ValueError:
        warnings.append(f"WARNING: MAX_UPLOAD_SIZE_MB={max_upload_mb} is not a valid integer")

    for warning in warnings:
        logger.warning(warning)

# =============================================================================
# Rate Limiting Setup
# =============================================================================

limiter = Limiter(key_func=get_remote_address)

# =============================================================================
# Lifespan Context Manager (replaces deprecated on_event)
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    validate_environment()
    get_face_detector()
    logger.info("Face detector initialized with YuNet model")
    cleanup_old_files()
    logger.info("Initial cleanup completed")

    # Start background cleanup task
    cleanup_task = asyncio.create_task(periodic_cleanup())

    yield

    # Shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="Face Detection API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# =============================================================================
# Security Configuration
# =============================================================================

# API Key authentication
API_KEY = os.environ.get("API_KEY", "")

async def verify_api_key(x_api_key: str = Header(default=None)) -> bool:
    """Verify API key if one is configured"""
    if API_KEY and x_api_key != API_KEY:
        logger.warning("Invalid API key attempt")
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True

# CORS Configuration - read from environment
def get_allowed_origins() -> list[str]:
    """Get allowed origins from environment variable"""
    origins_env = os.environ.get("ALLOWED_ORIGINS", "")
    if origins_env:
        # Split by comma and strip whitespace
        origins = [o.strip() for o in origins_env.split(",") if o.strip()]
        # Validate no wildcards
        for origin in origins:
            if "*" in origin:
                logger.error(f"Wildcard not allowed in ALLOWED_ORIGINS: {origin}")
                raise ValueError("Wildcards are not allowed in ALLOWED_ORIGINS")
        return origins
    # Default to localhost only for development
    return ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# =============================================================================
# File Storage Configuration
# =============================================================================

TEMP_DIR = Path(tempfile.gettempdir()) / "blurthatguy"
TEMP_DIR.mkdir(exist_ok=True)

MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "100"))
CHUNK_SIZE = 8192  # 8KB chunks for streaming

# =============================================================================
# Path Traversal Protection
# =============================================================================

UUID_PATTERN = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')

def validate_video_id(video_id: str) -> str:
    """Validate video ID format to prevent path traversal"""
    if not UUID_PATTERN.match(video_id):
        logger.warning(f"Invalid video ID format attempted: {video_id}")
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    return video_id

def get_safe_video_path(video_id: str, suffix: str = ".mp4") -> Path:
    """Get a safe video path, ensuring it's within TEMP_DIR"""
    video_id = validate_video_id(video_id)
    video_path = (TEMP_DIR / f"{video_id}{suffix}").resolve()

    # Verify the resolved path is within TEMP_DIR
    if not str(video_path).startswith(str(TEMP_DIR.resolve())):
        logger.error(f"Path traversal attempt detected: {video_path}")
        raise HTTPException(status_code=400, detail="Invalid video path")

    return video_path

# =============================================================================
# Temporary File Cleanup
# =============================================================================

def cleanup_old_files(max_age_hours: int = 1) -> int:
    """Delete temporary files older than max_age_hours"""
    if not TEMP_DIR.exists():
        return 0

    cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
    deleted_count = 0

    try:
        for file_path in TEMP_DIR.iterdir():
            if file_path.is_file():
                file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                if file_mtime < cutoff_time:
                    try:
                        file_path.unlink()
                        deleted_count += 1
                        logger.debug(f"Deleted old file: {file_path.name}")
                    except OSError as e:
                        logger.error(f"Failed to delete {file_path}: {e}")
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")

    if deleted_count > 0:
        logger.info(f"Cleaned up {deleted_count} old files")

    return deleted_count

async def periodic_cleanup() -> None:
    """Background task to periodically clean up old files"""
    while True:
        await asyncio.sleep(30 * 60)  # 30 minutes
        cleanup_old_files()

# =============================================================================
# Face Detection Model
# =============================================================================

face_detector = None
MODELS_DIR = Path(__file__).parent / "models"

def download_yunet_model() -> str:
    """Download YuNet model if not present"""
    MODELS_DIR.mkdir(exist_ok=True)
    model_path = MODELS_DIR / "face_detection_yunet_2023mar.onnx"

    if not model_path.exists():
        logger.info("Downloading YuNet model...")
        url = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        urllib.request.urlretrieve(url, model_path)
        logger.info("YuNet model downloaded")

    return str(model_path)

def get_face_detector(width: int = 640, height: int = 480):
    """Get or create face detector with specified input size"""
    global face_detector

    model_path = download_yunet_model()

    face_detector = cv2.FaceDetectorYN.create(
        model_path,
        "",
        (width, height),
        score_threshold=FACE_DETECTION_CONFIG["score_threshold"],
        nms_threshold=FACE_DETECTION_CONFIG["nms_threshold"],
        top_k=FACE_DETECTION_CONFIG["max_faces"]
    )

    return face_detector

def detect_faces(image: np.ndarray) -> list[dict]:
    """
    Detect faces in an image using YuNet
    Returns list of face detections with bbox and confidence
    """
    global face_detector

    height, width = image.shape[:2]
    face_detector.setInputSize((width, height))
    _, faces = face_detector.detect(image)

    results = []
    if faces is not None:
        for face in faces:
            x, y, w, h = face[:4].astype(int)
            confidence = float(face[14])
            results.append({
                "bbox": [int(x), int(y), int(w), int(h)],
                "score": confidence,
            })

    return results

# =============================================================================
# Request/Response Models with Validation
# =============================================================================

class ImageRequest(BaseModel):
    image: str  # base64 encoded image

class ExportRequest(BaseModel):
    tracks: list[dict]
    selectedTrackIds: list[int]
    padding: float = Field(
        default=VIDEO_PROCESSING_CONFIG["default_padding"],
        ge=0,
        le=VIDEO_PROCESSING_CONFIG["max_padding"]
    )
    blurAmount: int = Field(
        default=VIDEO_PROCESSING_CONFIG["default_blur_amount"],
        ge=VIDEO_PROCESSING_CONFIG["min_blur_amount"],
        le=VIDEO_PROCESSING_CONFIG["max_blur_amount"]
    )

    @field_validator('tracks')
    @classmethod
    def validate_tracks(cls, v: list[dict]) -> list[dict]:
        if not v:
            raise ValueError('tracks cannot be empty')
        return v

    @field_validator('selectedTrackIds')
    @classmethod
    def validate_selected_track_ids(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError('selectedTrackIds cannot be empty')
        for track_id in v:
            if not isinstance(track_id, int) or track_id < 0:
                raise ValueError('selectedTrackIds must contain valid positive integers')
        return v

# =============================================================================
# Video File Validation
# =============================================================================

def validate_video_file(filename: str, content_type: str | None) -> None:
    """Validate video file extension and MIME type"""
    # Check extension
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}"
        )

    # Check MIME type
    if content_type and content_type not in ALLOWED_VIDEO_MIMETYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_VIDEO_MIMETYPES)}"
        )

def verify_video_with_opencv(video_path: Path) -> bool:
    """Verify the file is a valid video using OpenCV"""
    try:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return False

        # Try to read at least one frame
        ret, _ = cap.read()
        cap.release()
        return ret
    except Exception:
        return False

# =============================================================================
# API Endpoints
# =============================================================================

@app.get("/health")
@limiter.limit("60/minute")
async def health(request: Request, _: bool = Depends(verify_api_key)):
    """Health check endpoint"""
    return {"status": "ok", "model": "YuNet"}

@app.post("/upload-video")
@limiter.limit("10/minute")
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    _: bool = Depends(verify_api_key)
):
    """Upload a video file and return an ID for later processing"""
    try:
        # Validate file type
        validate_video_file(file.filename or "video.mp4", file.content_type)

        video_id = str(uuid.uuid4())
        video_path = TEMP_DIR / f"{video_id}.mp4"

        max_size = MAX_UPLOAD_SIZE_MB * 1024 * 1024
        size = 0

        # Stream upload in chunks to prevent memory exhaustion
        with open(video_path, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > max_size:
                    f.close()
                    video_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB."
                    )
                f.write(chunk)

        # Verify it's actually a valid video
        if not verify_video_with_opencv(video_path):
            video_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail="Invalid video file. Could not read video data."
            )

        logger.info(f"Video uploaded successfully: {video_id} ({size / 1024 / 1024:.1f}MB)")
        return {"videoId": video_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload video")

@app.post("/export/{video_id}")
@limiter.limit("10/minute")
async def export_video(
    request: Request,
    video_id: str,
    export_request: ExportRequest,
    _: bool = Depends(verify_api_key)
):
    """Process video with blurred faces and return the result"""
    input_path = get_safe_video_path(video_id, ".mp4")

    if not input_path.exists():
        raise HTTPException(status_code=404, detail="Video not found. Please upload again.")

    output_path = get_safe_video_path(video_id, "_blurred.mp4")

    try:
        tracks_map = {t["id"]: t for t in export_request.tracks if t["id"] in export_request.selectedTrackIds}

        cap = cv2.VideoCapture(str(input_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            for track_id, track in tracks_map.items():
                det = find_detection_for_frame(track["frames"], frame_idx)
                if det is None:
                    continue

                bbox = det["bbox"]
                ox, oy, ow, oh = bbox
                padding = export_request.padding

                x = max(0, int(ox - ow * padding))
                y = max(0, int(oy - oh * padding))
                w = min(int(ow * (1 + padding * 2)), width - x)
                h = min(int(oh * (1 + padding * 2)), height - y)

                if w > 0 and h > 0:
                    face_region = frame[y:y+h, x:x+w]
                    blur_amt = export_request.blurAmount
                    small = cv2.resize(
                        face_region,
                        (max(1, w // blur_amt), max(1, h // blur_amt)),
                        interpolation=cv2.INTER_LINEAR
                    )
                    pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
                    frame[y:y+h, x:x+w] = pixelated

            out.write(frame)
            frame_idx += 1

        cap.release()
        out.release()

        logger.info(f"Video exported successfully: {video_id}")
        return FileResponse(
            str(output_path),
            media_type="video/mp4",
            filename="blurred-video.mp4"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export error for {video_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process video")

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
@limiter.limit("500/minute")
async def detect_endpoint(
    request: Request,
    image_request: ImageRequest,
    _: bool = Depends(verify_api_key)
):
    """Detect faces in a base64-encoded image"""
    try:
        image_data = image_request.image
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Failed to decode image")

        faces = detect_faces(image)
        return {"faces": faces}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect faces")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
