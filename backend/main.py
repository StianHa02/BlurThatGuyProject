from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from contextlib import asynccontextmanager
import cv2
import numpy as np
import json
from pathlib import Path
import urllib.request
import tempfile
import os
import uuid
import re
import logging
import asyncio
import threading
import subprocess
import shutil
from concurrent.futures import ThreadPoolExecutor
import multiprocessing
from datetime import datetime, timedelta
from typing import List

try:
    import importlib
    spec = importlib.util.find_spec("dotenv")
    if spec is not None:
        dotenv = importlib.import_module("dotenv")
        dotenv.load_dotenv(dotenv_path=Path(__file__).parent / ".env.local")
except Exception:
    pass

# =============================================================================
# Configuration
# =============================================================================

FACE_DETECTION_CONFIG = {
    "score_threshold": 0.6,
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

TRACKER_CONFIG = {
    "iou_threshold": 0.1,
    "max_misses": 20,
    "min_track_length": 5,
    "max_center_distance": 2.0,
}

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# =============================================================================
# Environment Validation
# =============================================================================

def validate_environment() -> None:
    api_key = os.environ.get("API_KEY", "")
    if not api_key:
        is_dev = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")
        if is_dev:
            logger.warning("⚠️  WARNING: Running in DEV_MODE without API_KEY - API is UNPROTECTED!")
        else:
            raise RuntimeError(
                "FATAL: API_KEY environment variable is required!\n"
                "Set DEV_MODE=true for local development."
            )
    if not os.environ.get("ALLOWED_ORIGINS"):
        logger.warning("WARNING: ALLOWED_ORIGINS not set - using localhost only")


# =============================================================================
# Detector Pool
# =============================================================================

DETECTOR_POOL_SIZE = int(os.environ.get("DETECTOR_POOL_SIZE", max(2, multiprocessing.cpu_count())))

_thread_pool: ThreadPoolExecutor | None = None
_model_path: Path | None = None
_detector_pool: list = []
_pool_lock = threading.Lock()
_pool_semaphore: threading.Semaphore | None = None


def get_thread_pool() -> ThreadPoolExecutor:
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=DETECTOR_POOL_SIZE)
        logger.info(f"Thread pool created with {DETECTOR_POOL_SIZE} workers")
    return _thread_pool


def _get_model_path() -> Path:
    global _model_path
    if _model_path is not None:
        return _model_path
    path = Path(__file__).parent / "models" / "face_detection_yunet_2023mar.onnx"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        url = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        logger.info("Downloading YuNet model...")
        urllib.request.urlretrieve(url, path)
        logger.info("Model downloaded successfully")
    _model_path = path
    return _model_path


def _create_detector() -> cv2.FaceDetectorYN:
    return cv2.FaceDetectorYN.create(
        model=str(_get_model_path()),
        config="",
        input_size=(320, 320),
        score_threshold=FACE_DETECTION_CONFIG["score_threshold"],
        nms_threshold=FACE_DETECTION_CONFIG["nms_threshold"],
        top_k=FACE_DETECTION_CONFIG["max_faces"],
    )


def get_face_detector():
    global _detector_pool, _pool_semaphore
    with _pool_lock:
        if not _detector_pool:
            logger.info(f"Creating detector pool with {DETECTOR_POOL_SIZE} instances")
            _detector_pool = [_create_detector() for _ in range(DETECTOR_POOL_SIZE)]
            _pool_semaphore = threading.Semaphore(DETECTOR_POOL_SIZE)
    return _detector_pool[0]


class _DetectorLease:
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
    h, w = image.shape[:2]
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
                float(f[3]) / scale,
            ],
            "score": float(f[-1]),
        }
        for f in faces
    ]


def detect_faces(image: np.ndarray) -> list[dict]:
    return _run_detection(image)


# =============================================================================
# Server-side Tracker (mirrors frontend tracker.ts exactly)
# =============================================================================

def _iou(a: list, b: list) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix1 = max(ax, bx)
    iy1 = max(ay, by)
    ix2 = min(ax + aw, bx + bw)
    iy2 = min(ay + ah, by + bh)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    intersection = iw * ih
    union = aw * ah + bw * bh - intersection
    return intersection / union if union > 0 else 0.0


def _center_distance(a: list, b: list) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    dx = (ax + aw / 2) - (bx + bw / 2)
    dy = (ay + ah / 2) - (by + bh / 2)
    avg_size = (aw + ah + bw + bh) / 4
    return (dx * dx + dy * dy) ** 0.5 / avg_size if avg_size > 0 else 9999.0


def _similar_size(a: list, b: list) -> bool:
    area_a = a[2] * a[3]
    area_b = b[2] * b[3]
    if area_b == 0:
        return False
    ratio = area_a / area_b
    return 0.5 < ratio < 2.0


def track_detections(detections_per_frame: dict) -> list[dict]:
    """IOU + distance tracker — mirrors tracker.ts trackDetections() exactly."""
    iou_threshold = TRACKER_CONFIG["iou_threshold"]
    max_misses = TRACKER_CONFIG["max_misses"]
    min_track_length = TRACKER_CONFIG["min_track_length"]
    max_center_distance = TRACKER_CONFIG["max_center_distance"]

    tracks = []
    next_id = 1

    for frame_index in sorted(detections_per_frame.keys()):
        detections = sorted(detections_per_frame[frame_index], key=lambda d: -d["score"])
        used_track_ids = set()

        for det in detections:
            best_track = None
            best_score = -float("inf")

            for t in tracks:
                if t["id"] in used_track_ids:
                    continue
                if frame_index - t["last_frame"] > max_misses + 1:
                    continue

                iou_val = _iou(det["bbox"], t["last_box"])
                dist_val = _center_distance(det["bbox"], t["last_box"])
                size_match = _similar_size(det["bbox"], t["last_box"])

                score = iou_val
                if iou_val < iou_threshold and dist_val < max_center_distance and size_match:
                    score = max(score, 0.5 - dist_val * 0.2)

                if score > best_score:
                    best_score = score
                    best_track = t

            if best_track and best_score >= iou_threshold:
                best_track["frames"].append({
                    "frameIndex": frame_index,
                    "bbox": det["bbox"],
                    "score": det["score"],
                })
                best_track["last_box"] = det["bbox"]
                best_track["last_frame"] = frame_index
                used_track_ids.add(best_track["id"])
            else:
                t = {
                    "id": next_id,
                    "frames": [{"frameIndex": frame_index, "bbox": det["bbox"], "score": det["score"]}],
                    "last_box": det["bbox"],
                    "last_frame": frame_index,
                    "misses": 0,
                }
                next_id += 1
                tracks.append(t)
                used_track_ids.add(t["id"])

        for t in tracks:
            if t["last_frame"] < frame_index:
                t["misses"] += 1

    result = []
    for t in tracks:
        if len(t["frames"]) < min_track_length:
            continue
        start_frame = t["frames"][0]["frameIndex"]
        end_frame = t["frames"][-1]["frameIndex"]
        mid_idx = len(t["frames"]) // 2
        result.append({
            "id": t["id"],
            "frames": t["frames"],
            "startFrame": start_frame,
            "endFrame": end_frame,
            "thumbnailFrameIndex": t["frames"][mid_idx]["frameIndex"],
        })

    return sorted(result, key=lambda t: -len(t["frames"]))


# =============================================================================
# Detection Results Store (in-memory, keyed by video_id)
# =============================================================================

_detection_store: dict[str, list[dict]] = {}
_store_lock = threading.Lock()


def store_tracks(video_id: str, tracks: list[dict]):
    with _store_lock:
        _detection_store[video_id] = tracks


def get_tracks(video_id: str) -> list[dict] | None:
    with _store_lock:
        return _detection_store.get(video_id)


def clear_tracks(video_id: str):
    with _store_lock:
        _detection_store.pop(video_id, None)


# =============================================================================
# File Storage & Cleanup
# =============================================================================

TEMP_DIR = Path(tempfile.gettempdir()) / "blurthatguy"
TEMP_DIR.mkdir(exist_ok=True)

try:
    _max_upload_env = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "100"))
except Exception:
    _max_upload_env = 100
MAX_UPLOAD_SIZE_MB = max(1, min(_max_upload_env, 100))
CHUNK_SIZE = 1024 * 1024  # 1MB

UUID_PATTERN = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')


def validate_video_id(video_id: str) -> str:
    if not UUID_PATTERN.match(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    return video_id


def get_safe_video_path(video_id: str, suffix: str = ".mp4") -> Path:
    validate_video_id(video_id)
    return TEMP_DIR / f"{video_id}{suffix}"


async def periodic_cleanup():
    while True:
        await asyncio.sleep(3600)
        cleanup_old_files()


def cleanup_old_files():
    try:
        cutoff = datetime.now() - timedelta(hours=24)
        count = sum(
            1 for p in TEMP_DIR.glob("*")
            if p.is_file() and datetime.fromtimestamp(p.stat().st_mtime) < cutoff
            and not p.unlink()
        )
        if count:
            logger.info(f"Cleaned up {count} old temporary files")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")


# =============================================================================
# Lifespan
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_environment()
    get_face_detector()
    logger.info("Face detector initialized")
    cleanup_old_files()
    cleanup_task = asyncio.create_task(periodic_cleanup())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    if _thread_pool:
        _thread_pool.shutdown(wait=False)


# =============================================================================
# App & Middleware
# =============================================================================

app = FastAPI(title="Face Detection API", lifespan=lifespan)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


API_KEY = os.environ.get("API_KEY", "")
_dev_mode = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")
logger.info(f"Startup: DEV_MODE={_dev_mode}, API_KEY_set={bool(API_KEY)}")


async def verify_api_key(x_api_key: str = Header(default=None)) -> bool:
    if _dev_mode:
        return True
    if API_KEY and x_api_key != API_KEY:
        logger.warning("Invalid API key attempt")
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True


def get_allowed_origins() -> list[str]:
    origins_env = os.environ.get("ALLOWED_ORIGINS", "")
    if origins_env:
        origins = [o.strip() for o in origins_env.split(",") if o.strip()]
        for o in origins:
            if "*" in o:
                raise ValueError("Wildcards not allowed in ALLOWED_ORIGINS")
        return origins
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# =============================================================================
# Pydantic Models
# =============================================================================

class FaceDetectionResult(BaseModel):
    bbox: List[float]
    score: float


class BatchFrameRequest(BaseModel):
    frameIndex: int = Field(..., ge=0)
    image: str = Field(..., min_length=100, max_length=50_000_000)


class BatchDetectRequest(BaseModel):
    batch: List[BatchFrameRequest] = Field(..., min_length=1, max_length=25)

    @field_validator('batch')
    @classmethod
    def validate_batch_size(cls, v):
        if len(v) > 25:
            raise ValueError("Batch size must not exceed 25 frames")
        return v


class BatchFrameResult(BaseModel):
    frameIndex: int
    faces: List[FaceDetectionResult]


class BatchDetectResponse(BaseModel):
    results: List[BatchFrameResult]


class ExportRequest(BaseModel):
    # Tracks removed — backend uses stored detection results
    selectedTrackIds: List[int] = Field(..., max_length=400)
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
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}")
    if content_type and content_type not in ALLOWED_VIDEO_MIMETYPES:
        raise HTTPException(status_code=400, detail="Invalid video MIME type")


# =============================================================================
# Helpers
# =============================================================================

def find_detection_for_frame(frames: list, frame_idx: int) -> dict | None:
    """Binary search + interpolation. Matches frontend PlayerWithMask logic exactly."""
    if not frames:
        return None

    max_gap = 20
    padding = 0

    if frame_idx < frames[0]["frameIndex"] - 20:
        return None
    if frame_idx > frames[-1]["frameIndex"] + 20:
        return None

    left, right = 0, len(frames) - 1
    while left <= right:
        mid = (left + right) // 2
        if frames[mid]["frameIndex"] == frame_idx:
            return frames[mid]
        elif frames[mid]["frameIndex"] < frame_idx:
            left = mid + 1
        else:
            right = mid - 1

    prev_f = frames[left - 1] if left > 0 else None
    next_f = frames[left] if left < len(frames) else None

    if prev_f and not next_f:
        return prev_f if (frame_idx - prev_f["frameIndex"]) <= padding else None
    if next_f and not prev_f:
        return next_f if (next_f["frameIndex"] - frame_idx) <= padding else None
    if prev_f and next_f:
        gap = next_f["frameIndex"] - prev_f["frameIndex"]
        if gap > max_gap:
            return None
        t = (frame_idx - prev_f["frameIndex"]) / gap
        pb, nb = prev_f["bbox"], next_f["bbox"]
        return {
            "frameIndex": frame_idx,
            "bbox": [pb[i] + (nb[i] - pb[i]) * t for i in range(4)],
            "score": prev_f["score"] * (1 - t) + next_f["score"] * t,
        }

    return None


# =============================================================================
# API Endpoints
# =============================================================================

@app.get("/health")
async def health():
    return {"status": "ok", "model": "YuNet"}


@app.get("/health/auth")
async def health_authenticated(_: bool = Depends(verify_api_key)):
    return {
        "status": "ok",
        "model": "YuNet",
        "authenticated": True,
        "max_upload_mb": MAX_UPLOAD_SIZE_MB,
        "temp_dir": str(TEMP_DIR),
    }


@app.post("/upload-video")
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    _: bool = Depends(verify_api_key),
):
    validate_video_file(file.filename or "video.mp4", file.content_type)

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
        except ValueError:
            pass

    video_id = str(uuid.uuid4())
    video_path = TEMP_DIR / f"{video_id}.mp4"
    max_size = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    size = 0

    try:
        with open(video_path, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > max_size:
                    video_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
                f.write(chunk)

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            video_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Invalid video file.")

        fps = float(cap.get(cv2.CAP_PROP_FPS)) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        logger.info(f"Uploaded {video_id} ({size/1024/1024:.1f}MB, {fps}fps, {width}x{height}, {frame_count} frames)")
        return {
            "videoId": video_id,
            "metadata": {"fps": fps, "width": width, "height": height, "frameCount": frame_count},
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        video_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to upload video")


@app.post("/detect-video/{video_id}")
def detect_video_id_endpoint(
    video_id: str,
    sample_rate: int = 3,
    _: bool = Depends(verify_api_key),
):
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
            total_steps = max(1, (total_frames + sample_rate - 1) // sample_rate) if total_frames > 0 else 1
            completed_steps = 0
            detections_per_frame = {}

            pool = get_thread_pool()
            pending_futures = []
            MAX_PENDING = DETECTOR_POOL_SIZE * 2
            target_idx = 0
            current_frame = 0

            while True:
                if total_frames > 0 and target_idx >= total_frames:
                    break
                if target_idx != current_frame:
                    if not cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx):
                        break
                ret, frame = cap.read()
                if not ret:
                    break
                current_frame = target_idx + 1

                future = pool.submit(detect_faces, frame)
                pending_futures.append((target_idx, future))

                while len(pending_futures) >= MAX_PENDING:
                    idx, fut = pending_futures.pop(0)
                    try:
                        faces = fut.result()
                        if faces:
                            detections_per_frame[idx] = faces
                    except Exception as e:
                        logger.error(f"Detection failed frame {idx}: {e}")
                    completed_steps += 1
                    # Detection = 0-80%, tracking = 80-100%
                    yield json.dumps({"type": "progress", "progress": round(completed_steps / total_steps * 80, 1)}) + "\n"

                target_idx += sample_rate

            for idx, fut in pending_futures:
                try:
                    faces = fut.result()
                    if faces:
                        detections_per_frame[idx] = faces
                except Exception as e:
                    logger.error(f"Detection failed frame {idx}: {e}")
                completed_steps += 1
                yield json.dumps({"type": "progress", "progress": min(80, round(completed_steps / total_steps * 80, 1))}) + "\n"

            cap.release()
            logger.info(f"Detection done for {video_id}: {len(detections_per_frame)} frames with faces")

            # Track server-side
            yield json.dumps({"type": "progress", "progress": 85}) + "\n"
            tracks = track_detections(detections_per_frame)
            logger.info(f"Tracking done for {video_id}: {len(tracks)} tracks")

            # Store tracks for export — no need to resend from frontend
            store_tracks(video_id, tracks)

            yield json.dumps({"type": "progress", "progress": 100}) + "\n"
            yield json.dumps({"type": "results", "results": tracks}) + "\n"

        except Exception as e:
            logger.error(f"Video detection stream error: {e}")
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.post("/export/{video_id}")
async def export_video(
    video_id: str,
    export_request: ExportRequest,
    _: bool = Depends(verify_api_key),
):
    input_path = get_safe_video_path(video_id, ".mp4")
    if not input_path.exists():
        raise HTTPException(status_code=404, detail="Video not found. Please upload again.")

    # Use stored tracks — never sent back from frontend
    tracks = get_tracks(video_id)
    if tracks is None:
        raise HTTPException(status_code=400, detail="Detection results not found. Please re-run detection.")

    raw_path = get_safe_video_path(video_id, "_raw.mp4")
    output_path = get_safe_video_path(video_id, "_blurred.mp4")

    try:
        tracks_map = {t["id"]: t for t in tracks if t["id"] in export_request.selectedTrackIds}

        cap = cv2.VideoCapture(str(input_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(raw_path), fourcc, fps, (width, height))

        chunk_size = DETECTOR_POOL_SIZE * 4

        def blur_frame(args):
            idx, frame = args
            for track in tracks_map.values():
                det = find_detection_for_frame(track["frames"], int(idx))
                if det is None:
                    continue
                ox, oy, ow, oh = det["bbox"]
                pad = export_request.padding
                x = max(0, int(ox - ow * pad))
                y = max(0, int(oy - oh * pad))
                w = min(int(ow * (1 + pad * 2)), width - x)
                h = min(int(oh * (1 + pad * 2)), height - y)
                if w > 0 and h > 0:
                    blur_amt = export_request.blurAmount
                    region = frame[y:y + h, x:x + w]
                    small = cv2.resize(region, (max(1, w // blur_amt), max(1, h // blur_amt)),
                                       interpolation=cv2.INTER_NEAREST)
                    frame[y:y + h, x:x + w] = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
            return (idx, frame)

        pool = get_thread_pool()
        chunk = []

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            chunk.append((cap.get(cv2.CAP_PROP_POS_FRAMES) - 1, frame))
            if len(chunk) >= chunk_size:
                for _, f in sorted(pool.map(blur_frame, chunk), key=lambda x: x[0]):
                    out.write(f)
                chunk = []

        if chunk:
            for _, f in sorted(pool.map(blur_frame, chunk), key=lambda x: x[0]):
                out.write(f)

        cap.release()
        out.release()

        # Re-encode with H.264 and mux original audio — dramatically smaller output
        if shutil.which("ffmpeg"):
            result = subprocess.run([
                "ffmpeg", "-y",
                "-i", str(raw_path),
                "-i", str(input_path),
                "-c:v", "libx264",
                "-crf", "23",
                "-preset", "fast",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0?",
                "-shortest",
                str(output_path),
            ], capture_output=True, timeout=600)
            raw_path.unlink(missing_ok=True)
            if result.returncode != 0:
                logger.error(f"ffmpeg failed: {result.stderr.decode()}")
                raise HTTPException(status_code=500, detail="Failed to encode video")
        else:
            logger.warning("ffmpeg not found — serving uncompressed output")
            raw_path.rename(output_path)

        logger.info(f"Export complete: {video_id}")
        return FileResponse(str(output_path), media_type="video/mp4", filename="blurred-video.mp4")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export error {video_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process video")


@app.post("/detect-batch", response_model=BatchDetectResponse)
async def detect_batch_endpoint(
    batch_request: BatchDetectRequest,
    _: bool = Depends(verify_api_key),
):
    def process_frame(frame_req: BatchFrameRequest) -> BatchFrameResult:
        image_data = frame_req.image.split(",", 1)[-1] if "," in frame_req.image else frame_req.image
        try:
            nparr = np.frombuffer(__import__("base64").b64decode(image_data), np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None:
                return BatchFrameResult(frameIndex=frame_req.frameIndex, faces=[])
            faces = detect_faces(image)
            return BatchFrameResult(
                frameIndex=frame_req.frameIndex,
                faces=[FaceDetectionResult(bbox=f["bbox"], score=f["score"]) for f in faces],
            )
        except Exception as e:
            logger.error(f"Error processing frame {frame_req.frameIndex}: {e}")
            return BatchFrameResult(frameIndex=frame_req.frameIndex, faces=[])

    try:
        loop = asyncio.get_event_loop()
        results = await asyncio.gather(*[
            loop.run_in_executor(get_thread_pool(), process_frame, fr)
            for fr in batch_request.batch
        ])
        return BatchDetectResponse(results=list(results))
    except Exception as e:
        logger.error(f"Batch detection error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect faces in batch")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)