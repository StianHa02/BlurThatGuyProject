# Face Detection API with OpenCV DNN (YuNet)
# Security-hardened version with BATCH PROCESSING support

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Request
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
from typing import List

# Load environment variables from .env.local if present
# This ensures local development env vars (like API_KEY) in backend/.env.local are available via os.environ
try:
    import importlib

    spec = importlib.util.find_spec("dotenv")
    if spec is not None:
        dotenv = importlib.import_module("dotenv")
        _env_path = Path(__file__).parent / ".env.local"
        dotenv.load_dotenv(dotenv_path=_env_path)
except Exception:
    # If python-dotenv is not installed, continue without crashing; environment must be provided by system
    pass

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

    # CRITICAL: Fail fast if no API key in production
    # Only allow missing API key in explicit development mode
    if not api_key:
        is_dev = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")
        if is_dev:
            logger.warning("⚠️  WARNING: Running in DEV_MODE without API_KEY - API is UNPROTECTED!")
        else:
            raise RuntimeError(
                "FATAL: API_KEY environment variable is required!\n"
                "Set it in /etc/blurthatguy.env (production) or backend/.env.local (development)\n"
                "To run without API_KEY for testing, set DEV_MODE=true (NOT recommended for production)"
            )

    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "")
    if not allowed_origins:
        logger.warning("WARNING: ALLOWED_ORIGINS not set - using localhost only")

    max_upload_mb = os.environ.get("MAX_UPLOAD_SIZE_MB", "100")
    try:
        max_size = int(max_upload_mb)
        if max_size < 1 or max_size > 100:
            logger.warning(f"WARNING: MAX_UPLOAD_SIZE_MB={max_size} is outside reasonable range (1-100)")
    except ValueError:
        logger.warning(f"WARNING: MAX_UPLOAD_SIZE_MB={max_upload_mb} is not a valid integer")


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
# Security Middleware
# =============================================================================

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Only add HSTS if running over HTTPS
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


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

# Enforce a hard cap of 100MB server-side regardless of environment value
try:
    _max_upload_env = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "100"))
except Exception:
    _max_upload_env = 100
# Clamp to 1..100 MB to avoid unexpectedly large uploads
MAX_UPLOAD_SIZE_MB = max(1, min(_max_upload_env, 100))
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
    """Get sanitized path for video file"""
    validate_video_id(video_id)
    return TEMP_DIR / f"{video_id}{suffix}"


# =============================================================================
# Input Validation Models
# =============================================================================

class ImageRequest(BaseModel):
    """Model for single image detection request"""
    image: str = Field(..., min_length=100, max_length=50_000_000)

    @field_validator('image')
    @classmethod
    def validate_base64(cls, v: str) -> str:
        """Validate base64 format"""
        if not v or len(v) < 100:
            raise ValueError("Image data too short")
        return v


# NEW: Batch detection models
class BatchFrameRequest(BaseModel):
    """Single frame in a batch detection request"""
    frameIndex: int = Field(..., ge=0)
    image: str = Field(..., min_length=100, max_length=50_000_000)


class BatchDetectRequest(BaseModel):
    """Model for batch detection request"""
    batch: List[BatchFrameRequest] = Field(..., min_length=1, max_length=20)

    @field_validator('batch')
    @classmethod
    def validate_batch_size(cls, v: List[BatchFrameRequest]) -> List[BatchFrameRequest]:
        """Limit batch size to prevent abuse"""
        if len(v) > 20:
            raise ValueError("Batch size must not exceed 20 frames")
        return v


class FaceDetectionResult(BaseModel):
    """Single face detection result"""
    bbox: List[float]
    score: float


class BatchFrameResult(BaseModel):
    """Result for a single frame in batch"""
    frameIndex: int
    faces: List[FaceDetectionResult]


class BatchDetectResponse(BaseModel):
    """Response for batch detection"""
    results: List[BatchFrameResult]


class Track(BaseModel):
    """Track definition for video export"""
    id: int
    frames: list
    startFrame: int
    endFrame: int


class ExportRequest(BaseModel):
    """Model for video export request"""
    tracks: list[Track]
    selectedTrackIds: list[int] = Field(default_factory=list, max_length=100)
    padding: float = Field(default=VIDEO_PROCESSING_CONFIG["default_padding"],
                           ge=0.0, le=VIDEO_PROCESSING_CONFIG["max_padding"])
    blurAmount: int = Field(default=VIDEO_PROCESSING_CONFIG["default_blur_amount"],
                            ge=VIDEO_PROCESSING_CONFIG["min_blur_amount"],
                            le=VIDEO_PROCESSING_CONFIG["max_blur_amount"])


# =============================================================================
# File Validation
# =============================================================================

def validate_video_file(filename: str | None, content_type: str | None):
    """Validate uploaded video file type"""
    if filename is None:
        raise HTTPException(status_code=400, detail="Filename is required")

    # Check extension
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        allowed = ", ".join(ALLOWED_VIDEO_EXTENSIONS)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {allowed}"
        )

    # Check MIME type if provided
    if content_type and content_type not in ALLOWED_VIDEO_MIMETYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid video MIME type"
        )


# =============================================================================
# File Cleanup Tasks
# =============================================================================

async def periodic_cleanup():
    """Periodically clean up old temporary files"""
    while True:
        await asyncio.sleep(3600)  # Run every hour
        cleanup_old_files()


def cleanup_old_files():
    """Delete temporary files older than 24 hours"""
    try:
        cutoff = datetime.now() - timedelta(hours=24)
        count = 0

        for file_path in TEMP_DIR.glob("*"):
            if file_path.is_file():
                mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                if mtime < cutoff:
                    file_path.unlink()
                    count += 1

        if count > 0:
            logger.info(f"Cleaned up {count} old temporary files")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")


# =============================================================================
# Face Detection Core
# =============================================================================

_detector = None


def get_face_detector():
    """Initialize and return YuNet face detector (singleton)"""
    global _detector
    if _detector is not None:
        return _detector

    model_path = Path(__file__).parent / "models" / "face_detection_yunet_2023mar.onnx"

    # Download model if not present
    if not model_path.exists():
        model_path.parent.mkdir(parents=True, exist_ok=True)
        model_url = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        logger.info(f"Downloading YuNet model from {model_url}...")
        urllib.request.urlretrieve(model_url, model_path)
        logger.info("Model downloaded successfully")

    _detector = cv2.FaceDetectorYN.create(
        model=str(model_path),
        config="",
        input_size=(320, 320),
        score_threshold=FACE_DETECTION_CONFIG["score_threshold"],
        nms_threshold=FACE_DETECTION_CONFIG["nms_threshold"],
        top_k=FACE_DETECTION_CONFIG["max_faces"]
    )

    return _detector


def detect_faces(image: np.ndarray) -> list[dict]:
    """Detect faces in an image using YuNet"""
    detector = get_face_detector()
    h, w = image.shape[:2]
    detector.setInputSize((w, h))

    _, faces = detector.detect(image)

    if faces is None:
        return []

    results = []
    for face in faces:
        x, y, w_box, h_box = face[:4]
        confidence = float(face[-1])

        results.append({
            "bbox": [float(x), float(y), float(w_box), float(h_box)],
            "score": confidence
        })

    return results


def verify_video_with_opencv(video_path: Path) -> bool:
    """Verify that the uploaded file is a valid video using OpenCV"""
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
@limiter.limit("30/minute")
async def health(request: Request):
    """Public health check endpoint - no authentication required"""
    return {"status": "ok", "model": "YuNet"}


@app.get("/health/auth")
@limiter.limit("60/minute")
async def health_authenticated(request: Request, _: bool = Depends(verify_api_key)):
    """Authenticated health check with full status"""
    return {
        "status": "ok",
        "model": "YuNet",
        "authenticated": True,
        "max_upload_mb": MAX_UPLOAD_SIZE_MB,
        "temp_dir": str(TEMP_DIR)
    }


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

        # Early reject if Content-Length header exists and is over the limit
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                cl = int(content_length)
                if cl > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    logger.warning(f"Upload rejected via Content-Length: {cl} bytes")
                    raise HTTPException(status_code=413,
                                        detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
            except ValueError:
                # ignore invalid header and proceed to streaming check
                pass

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
        tracks_map = {t.id: t for t in export_request.tracks if t.id in export_request.selectedTrackIds}

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
                det = find_detection_for_frame(track.frames, frame_idx)
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
                    face_region = frame[y:y + h, x:x + w]
                    blur_amt = export_request.blurAmount
                    small = cv2.resize(
                        face_region,
                        (max(1, w // blur_amt), max(1, h // blur_amt)),
                        interpolation=cv2.INTER_LINEAR
                    )
                    pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
                    frame[y:y + h, x:x + w] = pixelated

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
@limiter.limit("100/second")
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
    except ValueError as e:
        # Catch validation errors from ImageRequest
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect faces")

@app.post("/detect-batch", response_model=BatchDetectResponse)
@limiter.limit("20/second")  # Lower rate limit since each request processes multiple frames
async def detect_batch_endpoint(
        request: Request,
        batch_request: BatchDetectRequest,
        _: bool = Depends(verify_api_key)
):
    """
    Detect faces in multiple frames at once (batch processing)
    Processes up to 20 frames per request for improved performance
    """
    try:
        results = []

        for frame_req in batch_request.batch:
            # Process each frame
            image_data = frame_req.image
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]

            try:
                image_bytes = base64.b64decode(image_data)
                nparr = np.frombuffer(image_bytes, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if image is None:
                    # If decoding fails, return empty faces for this frame
                    results.append(BatchFrameResult(
                        frameIndex=frame_req.frameIndex,
                        faces=[]
                    ))
                    continue

                # Detect faces
                faces = detect_faces(image)

                # Convert to response format
                face_results = [
                    FaceDetectionResult(bbox=face["bbox"], score=face["score"])
                    for face in faces
                ]

                results.append(BatchFrameResult(
                    frameIndex=frame_req.frameIndex,
                    faces=face_results
                ))

            except Exception as e:
                logger.error(f"Error processing frame {frame_req.frameIndex}: {e}")
                # Return empty result for failed frame
                results.append(BatchFrameResult(
                    frameIndex=frame_req.frameIndex,
                    faces=[]
                ))

        logger.info(f"Batch detection completed: {len(batch_request.batch)} frames processed")
        return BatchDetectResponse(results=results)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Batch detection error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect faces in batch")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)