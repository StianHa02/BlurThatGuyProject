# Face Detection API with OpenCV DNN (YuNet)
# Security-hardened version with BATCH PROCESSING support

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
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

# Load environment variables from ..env.local if present
# This ensures local development env vars (like API_KEY) in backend/..env.local are available via os.environ
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
                "Set it in /etc/blurthatguy.env (production) or backend/..env.local (development)\n"
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
    if _thread_pool:
        _thread_pool.shutdown(wait=False)


app = FastAPI(title="Face Detection API", lifespan=lifespan)


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

# Log current API/DEV mode status for debugging (do not log actual key)
_dev_mode_env = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")
logger.info(f"Startup env: DEV_MODE={_dev_mode_env}, API_KEY_set={bool(API_KEY)}")


async def verify_api_key(x_api_key: str = Header(default=None)) -> bool:
    """Verify API key if one is configured

    In DEV_MODE we allow bypassing API key checks for developer convenience. If DEV_MODE is set
    to true, this function will accept requests without a matching X-API-Key header but will log
    a warning so this behavior is visible in logs.
    """
    # If running in development mode, skip strict API key enforcement
    dev_mode = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")
    if dev_mode:
        logger.info("DEV_MODE enabled: skipping API key enforcement (requests are NOT authenticated)")
        return True

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
    # Allow larger batches for improved throughput (client may send up to 25 frames)
    batch: List[BatchFrameRequest] = Field(..., min_length=1, max_length=25)

    @field_validator('batch')
    @classmethod
    def validate_batch_size(cls, v: List[BatchFrameRequest]) -> List[BatchFrameRequest]:
        """Limit batch size to prevent abuse"""
        if len(v) > 25:
            raise ValueError("Batch size must not exceed 25 frames")
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


class DetectVideoResponse(BaseModel):
    """Response for server-side video detection"""
    fps: float
    totalFrames: int
    results: List[BatchFrameResult]


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

import threading
from concurrent.futures import ThreadPoolExecutor
import multiprocessing

# =============================================================================
# Thread-Safe Detector Pool
# =============================================================================

# Number of parallel detectors — tune to your CPU core count.
# Each detector instance is independent and safe to use from one thread at a time.
DETECTOR_POOL_SIZE = int(os.environ.get("DETECTOR_POOL_SIZE", max(2, multiprocessing.cpu_count())))

# Shared thread pool — created once, reused across all requests
_thread_pool: ThreadPoolExecutor | None = None


def get_thread_pool() -> ThreadPoolExecutor:
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=DETECTOR_POOL_SIZE)
        logger.info(f"Thread pool created with {DETECTOR_POOL_SIZE} workers")
    return _thread_pool

_model_path: Path | None = None
_detector_pool: list = []
_pool_lock = threading.Lock()
_pool_semaphore: threading.Semaphore | None = None


def _get_model_path() -> Path:
    """Ensure model is downloaded and return its path."""
    global _model_path
    if _model_path is not None:
        return _model_path
    path = Path(__file__).parent / "models" / "face_detection_yunet_2023mar.onnx"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        model_url = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        logger.info(f"Downloading YuNet model from {model_url}...")
        urllib.request.urlretrieve(model_url, path)
        logger.info("Model downloaded successfully")
    _model_path = path
    return _model_path


def _create_detector() -> cv2.FaceDetectorYN:
    """Create a fresh detector instance."""
    return cv2.FaceDetectorYN.create(
        model=str(_get_model_path()),
        config="",
        input_size=(320, 320),
        score_threshold=FACE_DETECTION_CONFIG["score_threshold"],
        nms_threshold=FACE_DETECTION_CONFIG["nms_threshold"],
        top_k=FACE_DETECTION_CONFIG["max_faces"],
    )


def get_face_detector():
    """Initialize the detector pool and return one detector (for single-frame use)."""
    global _detector_pool, _pool_semaphore
    with _pool_lock:
        if not _detector_pool:
            logger.info(f"Creating detector pool with {DETECTOR_POOL_SIZE} instances")
            _detector_pool = [_create_detector() for _ in range(DETECTOR_POOL_SIZE)]
            _pool_semaphore = threading.Semaphore(DETECTOR_POOL_SIZE)
    # Just return the first detector for single-frame legacy use
    return _detector_pool[0]


class _DetectorLease:
    """Context manager that checks out one detector from the pool."""
    def __enter__(self):
        _pool_semaphore.acquire()
        with _pool_lock:
            self._det = _detector_pool.pop()
        return self._det

    def __exit__(self, *_):
        with _pool_lock:
            _detector_pool.append(self._det)
        _pool_semaphore.release()


def _run_detection(image: np.ndarray) -> list[dict]:
    """Run detection using a leased detector from the pool."""
    with _DetectorLease() as detector:
        h, w = image.shape[:2]
        detector.setInputSize((w, h))
        _, faces = detector.detect(image)

    if faces is None:
        return []

    return [
        {"bbox": [float(f[0]), float(f[1]), float(f[2]), float(f[3])], "score": float(f[-1])}
        for f in faces
    ]


def detect_faces(image: np.ndarray) -> list[dict]:
    """Detect faces in an image using YuNet (thread-safe, pool-backed)."""
    return _run_detection(image)


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
async def health(request: Request):
    """Public health check endpoint - no authentication required"""
    return {"status": "ok", "model": "YuNet"}


@app.get("/health/auth")
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
        chunk_size = max(16, DETECTOR_POOL_SIZE * 4)  # floor of 16 prevents tiny batches on 2-vCPU instances

        # Pre-build per-track frame index maps once — O(total detections).
        # Without this, blur_frame does an O(n) linear scan for every frame × every track.
        # On a 5-min video with 2 tracks that's ~18,000 × 2 × n iterations; with the map it's O(1).
        tracks_frame_maps: dict[int, dict[int, dict]] = {
            track_id: {f["frameIndex"]: f for f in track.frames}
            for track_id, track in tracks_map.items()
        }

        def blur_frame(args):
            idx, frame = args
            for track_id, track in tracks_map.items():
                frame_map = tracks_frame_maps[track_id]

                # O(1) exact lookup first
                det = frame_map.get(idx)

                # Nearest-neighbour fallback for sampled/sparse detections (±15 frame window)
                if det is None:
                    best = None
                    best_diff = float('inf')
                    for fi, fd in frame_map.items():
                        diff = abs(fi - idx)
                        if diff < best_diff:
                            best_diff = diff
                            best = fd
                    det = best if best_diff <= 15 else None

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
                        interpolation=cv2.INTER_NEAREST
                    )
                    pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
                    frame[y:y + h, x:x + w] = pixelated
            return (idx, frame)

        pool = get_thread_pool()
        chunk = []

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            chunk.append((frame_idx, frame))
            frame_idx += 1

            if len(chunk) >= chunk_size:
                processed = list(pool.map(blur_frame, chunk))
                processed.sort(key=lambda x: x[0])
                for _, f in processed:
                    out.write(f)
                chunk = []

        # Flush remaining frames
        if chunk:
            processed = list(pool.map(blur_frame, chunk))
            processed.sort(key=lambda x: x[0])
            for _, f in processed:
                out.write(f)

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
    """Find the closest detection for a given frame index.

    Uses a pre-built dict for O(1) exact lookup, falling back to a linear
    nearest-neighbour search only when the exact frame is absent (interpolation
    window ±15 frames, unchanged from original behaviour).
    """
    if not frames:
        return None

    # Build index on first call — caller should cache this for hot paths;
    # here we rebuild per-call which is still O(n) worst-case on a miss,
    # but the exact-hit path (the overwhelmingly common case) is O(1).
    frame_map: dict[int, dict] = {f["frameIndex"]: f for f in frames}

    if frame_idx in frame_map:
        return frame_map[frame_idx]

    # Nearest-neighbour fallback (sparse detections / sampled video)
    best = None
    best_diff = float('inf')
    for f in frames:
        diff = abs(f["frameIndex"] - frame_idx)
        if diff < best_diff:
            best_diff = diff
            best = f

    return best if best_diff <= 15 else None


@app.post("/detect")
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
async def detect_batch_endpoint(
        request: Request,
        batch_request: BatchDetectRequest,
        _: bool = Depends(verify_api_key)
):
    """
    Detect faces in multiple frames at once (batch processing).
    Frames are decoded and detected in parallel using a thread pool.
    """
    def process_frame(frame_req: BatchFrameRequest) -> BatchFrameResult:
        image_data = frame_req.image
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        try:
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None:
                return BatchFrameResult(frameIndex=frame_req.frameIndex, faces=[])
            faces = detect_faces(image)
            return BatchFrameResult(
                frameIndex=frame_req.frameIndex,
                faces=[FaceDetectionResult(bbox=f["bbox"], score=f["score"]) for f in faces]
            )
        except Exception as e:
            logger.error(f"Error processing frame {frame_req.frameIndex}: {e}")
            return BatchFrameResult(frameIndex=frame_req.frameIndex, faces=[])

    try:
        futures = [
            asyncio.get_event_loop().run_in_executor(get_thread_pool(), process_frame, frame_req)
            for frame_req in batch_request.batch
        ]
        results = await asyncio.gather(*futures)

        logger.info(f"Batch detection completed: {len(batch_request.batch)} frames processed in parallel")
        return BatchDetectResponse(results=list(results))

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Batch detection error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect faces in batch")


@app.post("/detect-video/{video_id}", response_model=DetectVideoResponse)
async def detect_video_endpoint(
        video_id: str,
        sample_rate: int = 2,
        _: bool = Depends(verify_api_key)
):
    """
    Server-side frame extraction + parallel face detection.

    The video is already on disk from /upload-video — no second upload needed.
    Replaces the browser frame-extraction + /detect-batch loop entirely.

    sample_rate=2 → process every 2nd frame (halves work on a 30fps source,
    giving 15 effective fps of detection data, which is plenty for face tracking).
    """
    input_path = get_safe_video_path(video_id)
    if not input_path.exists():
        raise HTTPException(status_code=404, detail="Video not found. Please upload again.")

    sample_rate = max(1, min(sample_rate, 30))  # clamp to sane range

    # --- Stream frames in chunks to avoid loading entire video into RAM ---
    # At sample_rate=1 on 1080p, 3500 frames = ~21GB if loaded all at once.
    # Process CHUNK_FRAMES at a time: detect, discard, read next chunk.
    CHUNK_FRAMES = 50  # ~300MB peak RAM per chunk at 1080p

    cap = cv2.VideoCapture(str(input_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    def detect_frame(args: tuple[int, np.ndarray]) -> BatchFrameResult:
        idx, frame = args
        try:
            faces = detect_faces(frame)
            return BatchFrameResult(
                frameIndex=idx,
                faces=[FaceDetectionResult(bbox=f["bbox"], score=f["score"]) for f in faces]
            )
        except Exception as e:
            logger.error(f"Frame {idx} detection error: {e}")
            return BatchFrameResult(frameIndex=idx, faces=[])

    all_results: list[BatchFrameResult] = []
    chunk: list[tuple[int, np.ndarray]] = []
    frame_idx = 0
    frames_sampled = 0
    loop = asyncio.get_event_loop()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_rate == 0:
            chunk.append((frame_idx, frame.copy()))
            frames_sampled += 1

        frame_idx += 1

        if len(chunk) >= CHUNK_FRAMES:
            futures = [loop.run_in_executor(get_thread_pool(), detect_frame, args) for args in chunk]
            chunk_results = await asyncio.gather(*futures)
            all_results.extend(chunk_results)
            chunk.clear()  # free memory before reading next chunk

    # Flush remaining frames
    if chunk:
        futures = [loop.run_in_executor(get_thread_pool(), detect_frame, args) for args in chunk]
        chunk_results = await asyncio.gather(*futures)
        all_results.extend(chunk_results)

    cap.release()

    logger.info(
        f"detect-video {video_id}: processed {frames_sampled}/{total_frames} frames "
        f"(sample_rate={sample_rate}, {fps:.1f}fps source)"
    )
    return DetectVideoResponse(fps=fps, totalFrames=total_frames, results=all_results)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, h11_max_incomplete_event_size=200 * 1024 * 1024)