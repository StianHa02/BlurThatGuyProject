from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from contextlib import asynccontextmanager
import cv2
import numpy as np
import base64
import json
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
    "score_threshold": 0.35,
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
CHUNK_SIZE = 1024 * 1024  # 1MB chunks for faster streaming

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


class ExportRequest(BaseModel):
    """Model for video export request"""
    tracks: list[Track]
    selectedTrackIds: list[int] = Field(default_factory=list, max_length=100)
    padding: float = Field(default=VIDEO_PROCESSING_CONFIG["default_padding"],
                           ge=0.0, le=VIDEO_PROCESSING_CONFIG["max_padding"])
    blurAmount: int = Field(default=VIDEO_PROCESSING_CONFIG["default_blur_amount"],
                            ge=VIDEO_PROCESSING_CONFIG["min_blur_amount"],
                            le=VIDEO_PROCESSING_CONFIG["max_blur_amount"])
    sampleRate: int = Field(default=1, ge=1, le=60)


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
    h, w = image.shape[:2]

    # Optimization: Resize large images for faster detection
    # YuNet is very fast on smaller resolutions (e.g., 640x480).
    # 1080p or 4K is overkill for finding faces to blur.
    MAX_DET_DIM = 1280
    scale = 1.0
    if max(h, w) > MAX_DET_DIM:
        scale = MAX_DET_DIM / max(h, w)
        input_img = cv2.resize(image, (int(w * scale), int(h * scale)))
    else:
        input_img = image

    nh, nw = input_img.shape[:2]

    with _DetectorLease() as detector:
        detector.setInputSize((nw, nh))
        _, faces = detector.detect(input_img)

    if faces is None:
        return []

    return [
        {
            "bbox": [
                float(f[0]) / scale,
                float(f[1]) / scale,
                float(f[2]) / scale,
                float(f[3]) / scale
            ],
            "score": float(f[-1])
        }
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
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            video_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail="Invalid video file. Could not read video data."
            )
        
        # Get metadata
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        # Sanity check for FPS (OpenCV sometimes returns 0 for some formats)
        if fps <= 0:
            fps = 30.0
            logger.warning(f"Video {video_id} has invalid FPS (0). Defaulting to 30.0")

        logger.info(f"Video uploaded successfully: {video_id} ({size / 1024 / 1024:.1f}MB, {fps} FPS, {width}x{height}, {frame_count} frames)")
        return {
            "videoId": video_id,
            "metadata": {
                "fps": fps,
                "width": width,
                "height": height,
                "frameCount": frame_count
            }
        }

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
        chunk_size = DETECTOR_POOL_SIZE * 4  # scales with core count: 48 on M2 Pro (12 cores), 8 on c7i.large (2 vCPUs)

        def blur_frame(args):
            idx, frame = args
            for track_id, track in tracks_map.items():
                det = find_detection_for_frame(track.frames, idx, export_request.sampleRate)
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


def find_detection_for_frame(frames: list, frame_idx: int, sample_rate: int = 1) -> dict | None:
    """Find the closest detection for a given frame index and interpolate if needed"""
    if not frames:
        return None

    # Track frames are sorted by frameIndex in tracker.ts
    # Binary search or scan for the interval containing frame_idx
    prev_f = None
    next_f = None

    for f in frames:
        if f["frameIndex"] == frame_idx:
            return f
        if f["frameIndex"] < frame_idx:
            prev_f = f
        else:
            next_f = f
            break

    # If we only have one side or both are too far, return closest within reason
    max_gap = 20 # Match tracker's maxMisses
    
    # No padding for first/last detections as per user request to avoid "ghost" masks.
    padding = 0

    if prev_f and not next_f:
        return prev_f if abs(frame_idx - prev_f["frameIndex"]) <= padding else None
    if next_f and not prev_f:
        return next_f if abs(frame_idx - next_f["frameIndex"]) <= padding else None

    if prev_f and next_f:
        gap = next_f["frameIndex"] - prev_f["frameIndex"]
        if gap > max_gap:
            # Gap too large to bridge reliably. 
            # When gap is large, we don't apply any padding.
            if frame_idx == prev_f["frameIndex"]: return prev_f
            if frame_idx == next_f["frameIndex"]: return next_f
            return None

        # Linear interpolation
        t = (frame_idx - prev_f["frameIndex"]) / gap
        p_bbox = prev_f["bbox"]
        n_bbox = next_f["bbox"]

        interp_bbox = [
            p_bbox[0] + (n_bbox[0] - p_bbox[0]) * t,
            p_bbox[1] + (n_bbox[1] - p_bbox[1]) * t,
            p_bbox[2] + (n_bbox[2] - p_bbox[2]) * t,
            p_bbox[3] + (n_bbox[3] - p_bbox[3]) * t
        ]

        return {
            "frameIndex": frame_idx,
            "bbox": interp_bbox,
            "score": prev_f["score"] * (1-t) + next_f["score"] * t
        }

    return None


@app.post("/detect-video/{video_id}")
def detect_video_id_endpoint(
        video_id: str,
        sample_rate: int = 3,
        _: bool = Depends(verify_api_key)
):
    """Detect faces directly from an uploaded video file with streaming progress updates"""
    video_path = get_safe_video_path(video_id, ".mp4")
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    def generate():
        try:
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                yield json.dumps({"error": "Could not open video file"}) + "\n"
                return

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            results = []
            
            # Estimate total steps for progress calculation
            # Each step is one frame processed (either sequentially or via seek)
            total_steps = (total_frames + sample_rate - 1) // sample_rate if total_frames > 0 else 0
            completed_steps = 0
            
            # Parallel processing setup
            pool = get_thread_pool()
            pending_futures = []
            
            # Balance throughput and memory - don't load too many frames in memory simultaneously
            MAX_PENDING_DETECTIONS = DETECTOR_POOL_SIZE * 2
            
            # Robust loop to handle videos with or without accurate frame counts
            target_idx = 0
            current_frame = 0
            
            while True:
                # Check if we should stop. If total_frames is 0 or -1, we rely on cap.read() returning False.
                if total_frames > 0 and target_idx >= total_frames:
                    break
                
                # Optimization: only seek if we're not at the next sequential frame
                if target_idx != current_frame:
                    if not cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx):
                        break
                
                ret, frame = cap.read()
                if not ret:
                    break
                
                current_frame = target_idx + 1

                # Submit to pool for parallel detection
                future = pool.submit(detect_faces, frame)
                pending_futures.append((target_idx, future))
                
                # If we've reached the maximum number of pending detections, 
                # wait for the oldest one to maintain memory stability and frame order.
                while len(pending_futures) >= MAX_PENDING_DETECTIONS:
                    idx, fut = pending_futures.pop(0)
                    try:
                        faces = fut.result()
                        if faces:
                            results.append({
                                "frameIndex": idx,
                                "faces": [{"bbox": f["bbox"], "score": f["score"]} for f in faces]
                            })
                    except Exception as e:
                        logger.error(f"Detection failed for frame {idx}: {e}")
                    
                    completed_steps += 1
                    if total_steps > 0:
                        progress = round((completed_steps / total_steps) * 100, 1)
                        yield json.dumps({"type": "progress", "progress": progress}) + "\n"
                
                target_idx += sample_rate

            # Process any remaining futures in the pipeline
            for idx, fut in pending_futures:
                try:
                    faces = fut.result()
                    if faces:
                        results.append({
                            "frameIndex": idx,
                            "faces": [{"bbox": f["bbox"], "score": f["score"]} for f in faces]
                        })
                except Exception as e:
                    logger.error(f"Detection failed for final frame {idx}: {e}")
                
                completed_steps += 1
                if total_steps > 0:
                    progress = min(100, round((completed_steps / total_steps) * 100, 1))
                    yield json.dumps({"type": "progress", "progress": progress}) + "\n"

            cap.release()
            logger.info(f"Detection completed for video {video_id}: {len(results)} frames with faces")
            # Final results
            yield json.dumps({"type": "results", "results": results}) + "\n"

        except Exception as e:
            logger.error(f"Video detection error during stream: {e}")
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


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
        loop = asyncio.get_event_loop()
        futures = [
            loop.run_in_executor(get_thread_pool(), process_frame, frame_req)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)