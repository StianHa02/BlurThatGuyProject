from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
import cv2
import numpy as np
import json
from pathlib import Path
import tempfile
import os
import uuid
import re
import logging
import asyncio
import threading
import subprocess
import shutil
import queue
from concurrent.futures import ThreadPoolExecutor
import multiprocessing
import urllib.request
from datetime import datetime, timedelta
from typing import List
import onnxruntime as ort

try:
    import importlib
    spec = importlib.util.find_spec("dotenv")
    if spec is not None:
        importlib.import_module("dotenv").load_dotenv(dotenv_path=Path(__file__).parent / ".env.local")
except Exception:
    pass

# =============================================================================
# Configuration
# =============================================================================

FACE_DETECTION_CONFIG = {"score_threshold": 0.6, "nms_threshold": 0.3, "max_faces": 5000}
VIDEO_PROCESSING_CONFIG = {"default_padding": 0.4, "default_target_blocks": 8, "max_padding": 2.0, "max_target_blocks": 24, "min_target_blocks": 4}
TRACKER_CONFIG = {"iou_threshold": 0.1, "max_misses": 20, "min_track_length": 5, "max_center_distance": 2.0}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

TEMP_DIR = Path(tempfile.gettempdir()) / "blurthatguy"
TEMP_DIR.mkdir(exist_ok=True)
CHUNK_SIZE = 1024 * 1024
UUID_PATTERN = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')

try:
    MAX_UPLOAD_SIZE_MB = max(1, int(os.environ.get("MAX_UPLOAD_SIZE_MB", "")))
except Exception:
    MAX_UPLOAD_SIZE_MB = 0

# =============================================================================
# Detector Pool — onnxruntime SCRFD (thread-safe session, releases GIL)
# =============================================================================

DETECTOR_POOL_SIZE = int(os.environ.get("DETECTOR_POOL_SIZE", max(2, multiprocessing.cpu_count())))
_thread_pool: ThreadPoolExecutor | None = None
_model_path: Path | None = None
_detector_pool: list = []
_pool_lock = threading.Lock()
_pool_semaphore: threading.Semaphore | None = None
_h264_encoder: str | None = None
# scrfd_2.5g.onnx output layout (640x640 input):
#   scores: '446'(12800,1) '466'(3200,1) '486'(800,1)  → strides 8, 16, 32
#   bboxes: '449'(12800,4) '469'(3200,4) '489'(800,4)
#   kps:    '452'         '472'         '492'           → ignored
_SCRFD_SIZE = 640
_scrfd_anchors: dict = {}
_SCRFD_INPUT  = "input.1"
_SCRFD_STRIDES = [
    ("446", "449", 8),
    ("466", "469", 16),
    ("486", "489", 32),
]


def _get_encoder() -> str:
    """Test-encode a null frame with each HW encoder; use first that actually works."""
    global _h264_encoder
    if _h264_encoder is not None:
        return _h264_encoder
    _h264_encoder = "libx264"
    if not shutil.which("ffmpeg"):
        return _h264_encoder
    for enc in ("h264_nvenc", "h264_amf", "h264_videotoolbox", "h264_qsv"):
        try:
            r = subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error",
                 "-f", "lavfi", "-i", "nullsrc=s=128x128:d=1",
                 "-c:v", enc, "-f", "null", "-"],
                capture_output=True, timeout=10)
            if r.returncode == 0:
                _h264_encoder = enc
                break
        except Exception:
            continue
    logger.info(f"Selected H.264 encoder: {_h264_encoder}")
    return _h264_encoder

_ENCODER_ARGS: dict[str, list[str]] = {
    "h264_nvenc":        ["-c:v", "h264_nvenc", "-preset", "p3", "-cq", "26"],
    "h264_amf":          ["-c:v", "h264_amf", "-quality", "balanced", "-qp_i", "26"],
    "h264_videotoolbox": ["-c:v", "h264_videotoolbox", "-q:v", "55"],
    "h264_qsv":          ["-c:v", "h264_qsv", "-preset", "veryfast"],
    "libx264":           ["-c:v", "libx264", "-crf", "26", "-preset", "veryfast", "-threads", "0"],
}

_SCRFD_MODEL_URL = "https://huggingface.co/crj/dl-ws/resolve/8f8ec345154a161633d8294fd5e21908c97d7f8a/scrfd_2.5g.onnx"

def _get_model_path() -> Path:
    global _model_path
    if _model_path is None:
        path = Path(__file__).parent / "models" / "scrfd_2.5g.onnx"
        if not path.exists():
            logger.info(f"Downloading SCRFD model to {path} ...")
            path.parent.mkdir(exist_ok=True)
            urllib.request.urlretrieve(_SCRFD_MODEL_URL, path)
            logger.info("SCRFD model downloaded.")
        _model_path = path
    return _model_path


def get_thread_pool() -> ThreadPoolExecutor:
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=DETECTOR_POOL_SIZE)
        logger.info(f"Thread pool created with {DETECTOR_POOL_SIZE} workers")
    return _thread_pool


def get_face_detector():
    """Create shared ort session + semaphore. Session is thread-safe; pool slots are references."""
    global _detector_pool, _pool_semaphore
    with _pool_lock:
        if not _detector_pool:
            opts = ort.SessionOptions()
            opts.inter_op_num_threads = 1   # parallelism is via our thread pool
            opts.intra_op_num_threads = 2
            opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            session = ort.InferenceSession(
                str(_get_model_path()), sess_options=opts,
                providers=["CPUExecutionProvider"])
            logger.info(f"SCRFD session ready, pool size {DETECTOR_POOL_SIZE}")

            # ort session is thread-safe — share one instance across all pool slots
            _detector_pool = [session] * DETECTOR_POOL_SIZE
            _pool_semaphore = threading.Semaphore(DETECTOR_POOL_SIZE)
    get_thread_pool()


class _DetectorLease:
    """Context manager that checks out a detector from the shared pool."""
    def __enter__(self):
        _pool_semaphore.acquire()
        with _pool_lock:
            self._det = _detector_pool.pop()
        return self._det

    def __exit__(self, *_):
        with _pool_lock:
            _detector_pool.append(self._det)
        _pool_semaphore.release()


def _get_scrfd_anchors() -> dict:
    """Precompute anchor centers {stride: ndarray[N,2]} for a 640×640 input. Cached."""
    if not _scrfd_anchors:
        for stride in (8, 16, 32):
            n = _SCRFD_SIZE // stride
            cols = np.tile(np.arange(n), n)
            rows = np.repeat(np.arange(n), n)
            centers = np.stack([cols, rows], axis=1) * stride  # (cx, cy)
            _scrfd_anchors[stride] = np.repeat(centers, 2, axis=0).astype(np.float32)
    return _scrfd_anchors


def _scrfd_decode(outputs: list, output_names: list, scale: float) -> list[dict]:
    """Decode SCRFD raw outputs → [{bbox:[x,y,w,h], score}] in original image coords."""
    named = {n: o for n, o in zip(output_names, outputs)}
    anchors = _get_scrfd_anchors()
    thresh = FACE_DETECTION_CONFIG["score_threshold"]
    all_boxes, all_scores = [], []
    for score_key, bbox_key, stride in _SCRFD_STRIDES:
        score = named[score_key].reshape(-1)
        bbox  = named[bbox_key].reshape(-1, 4) * stride
        mask = score >= thresh
        if not mask.any():
            continue
        a = anchors[stride][mask]
        b = bbox[mask]
        x1 = (a[:, 0] - b[:, 0]) / scale
        y1 = (a[:, 1] - b[:, 1]) / scale
        x2 = (a[:, 0] + b[:, 2]) / scale
        y2 = (a[:, 1] + b[:, 3]) / scale
        all_boxes.append(np.stack([x1, y1, x2 - x1, y2 - y1], axis=1))
        all_scores.append(score[mask])
    if not all_boxes:
        return []
    boxes  = np.concatenate(all_boxes).tolist()
    scores = np.concatenate(all_scores).tolist()
    idx = cv2.dnn.NMSBoxes(boxes, scores, thresh, FACE_DETECTION_CONFIG["nms_threshold"])
    if not len(idx):
        return []
    return [{"bbox": boxes[i], "score": scores[i]} for i in idx.flatten()]


def detect_faces(image: np.ndarray) -> list[dict]:
    h, w = image.shape[:2]
    scale = min(1.0, _SCRFD_SIZE / max(h, w))
    nh, nw = int(h * scale), int(w * scale)
    canvas = np.zeros((_SCRFD_SIZE, _SCRFD_SIZE, 3), dtype=np.uint8)
    canvas[:nh, :nw] = cv2.resize(image, (nw, nh)) if scale < 1.0 else image[:nh, :nw]
    blob = ((canvas[:, :, ::-1].astype(np.float32) - 127.5) / 128.0).transpose(2, 0, 1)[np.newaxis]
    with _DetectorLease() as session:
        output_names = [o.name for o in session.get_outputs()]
        outputs = session.run(None, {_SCRFD_INPUT: blob})
    return _scrfd_decode(outputs, output_names, scale)


def _blur_frame(args: tuple) -> tuple[int, np.ndarray]:
    idx, frame, track_lookup_dicts, padding, target_blocks, width, height = args
    for lookup in track_lookup_dicts:
        det = lookup.get(int(idx))
        if det is None:
            continue
        ox, oy, ow, oh = det["bbox"]
        x = max(0, int(ox - ow * padding))
        y = max(0, int(oy - oh * padding))
        w = min(int(ow * (1 + padding * 2)), width - x)
        h = min(int(oh * (1 + padding * 2)), height - y)
        if w > 0 and h > 0:
            region = frame[y:y+h, x:x+w]
            # Adaptive block size: same block density regardless of face size
            block_size = max(1, min(w, h) // target_blocks)
            small = cv2.resize(region, (max(1, w // block_size), max(1, h // block_size)), interpolation=cv2.INTER_LINEAR)
            pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
            # Ellipse mask: only anonymise the face oval, not the full bounding box
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.ellipse(mask, (w // 2, h // 2), (w // 2, h // 2), 0, 0, 360, 255, -1)
            frame[y:y+h, x:x+w] = np.where(mask[:, :, np.newaxis], pixelated, region)
    return (idx, frame)


# =============================================================================
# Tracker — mirrors frontend tracker.ts exactly
# =============================================================================

def _iou(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    iw = max(0.0, min(ax+aw, bx+bw) - max(ax, bx))
    ih = max(0.0, min(ay+ah, by+bh) - max(ay, by))
    union = aw*ah + bw*bh - iw*ih
    return (iw*ih) / union if union > 0 else 0.0

def _center_distance(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    avg = (aw+ah+bw+bh) / 4
    return ((ax+aw/2 - bx-bw/2)**2 + (ay+ah/2 - by-bh/2)**2)**0.5 / avg if avg > 0 else 9999.0

def _similar_size(a, b):
    return 0.5 < (a[2]*a[3]) / (b[2]*b[3]) < 2.0 if b[2]*b[3] else False


def track_detections(detections_per_frame: dict) -> list[dict]:
    """IOU + distance tracker — mirrors tracker.ts trackDetections() exactly."""
    iou_th = TRACKER_CONFIG["iou_threshold"]
    max_misses = TRACKER_CONFIG["max_misses"]
    min_len = TRACKER_CONFIG["min_track_length"]
    max_dist = TRACKER_CONFIG["max_center_distance"]
    tracks, next_id = [], 1

    for fi in sorted(detections_per_frame):
        used = set()
        for det in sorted(detections_per_frame[fi], key=lambda d: -d["score"]):
            best, best_score = None, -float("inf")
            for t in tracks:
                if t["id"] in used or fi - t["last_frame"] > max_misses + 1:
                    continue
                iou = _iou(det["bbox"], t["last_box"])
                dist = _center_distance(det["bbox"], t["last_box"])
                score = max(iou, 0.5 - dist*0.2 if iou < iou_th and dist < max_dist and _similar_size(det["bbox"], t["last_box"]) else -1)
                if score > best_score:
                    best_score, best = score, t
            if best and best_score >= iou_th:
                best["frames"].append({"frameIndex": fi, "bbox": det["bbox"], "score": det["score"]})
                best["last_box"], best["last_frame"] = det["bbox"], fi
                used.add(best["id"])
            else:
                t = {"id": next_id, "frames": [{"frameIndex": fi, "bbox": det["bbox"], "score": det["score"]}],
                     "last_box": det["bbox"], "last_frame": fi, "misses": 0}
                next_id += 1; tracks.append(t); used.add(t["id"])
        for t in tracks:
            if t["last_frame"] < fi:
                t["misses"] += 1

    result = []
    for t in tracks:
        if len(t["frames"]) < min_len:
            continue
        mid = len(t["frames"]) // 2
        result.append({"id": t["id"], "frames": t["frames"],
                        "startFrame": t["frames"][0]["frameIndex"], "endFrame": t["frames"][-1]["frameIndex"],
                        "thumbnailFrameIndex": t["frames"][mid]["frameIndex"]})
    return sorted(result, key=lambda t: -len(t["frames"]))


# =============================================================================
# Detection store & helpers
# =============================================================================

_detection_store: dict[str, list[dict]] = {}
_store_lock = threading.Lock()

def store_tracks(video_id, tracks):
    with _store_lock: _detection_store[video_id] = tracks

def get_tracks(video_id):
    with _store_lock: return _detection_store.get(video_id)

def clear_tracks(video_id):
    with _store_lock: _detection_store.pop(video_id, None)


def _find_detection(frames: list, frame_idx: int) -> dict | None:
    """Binary search + interpolation. Matches frontend PlayerWithMask logic exactly."""
    if not frames: return None
    if frame_idx < frames[0]["frameIndex"] - 20 or frame_idx > frames[-1]["frameIndex"] + 20:
        return None
    left, right = 0, len(frames) - 1
    while left <= right:
        mid = (left + right) // 2
        if frames[mid]["frameIndex"] == frame_idx: return frames[mid]
        elif frames[mid]["frameIndex"] < frame_idx: left = mid + 1
        else: right = mid - 1
    prev_f = frames[left-1] if left > 0 else None
    next_f = frames[left] if left < len(frames) else None
    if prev_f and not next_f: return prev_f if (frame_idx - prev_f["frameIndex"]) <= 8 else None
    if next_f and not prev_f: return next_f if (next_f["frameIndex"] - frame_idx) <= 8 else None
    if prev_f and next_f:
        gap = next_f["frameIndex"] - prev_f["frameIndex"]
        if gap > 20: return None
        t = (frame_idx - prev_f["frameIndex"]) / gap
        pb, nb = prev_f["bbox"], next_f["bbox"]
        return {"frameIndex": frame_idx, "bbox": [pb[i] + (nb[i]-pb[i])*t for i in range(4)],
                "score": prev_f["score"]*(1-t) + next_f["score"]*t}
    return None


def _precompute_track_lookups(tracks_frames_list: list, total_frames: int) -> list[dict]:
    """Pre-build {frameIndex: detection} dicts for O(1) lookup during blur."""
    if total_frames <= 0:
        return [{} for _ in tracks_frames_list]
    lookups = []
    for frames in tracks_frames_list:
        lookup = {}
        if frames:
            start = max(0, int(frames[0]["frameIndex"]) - 20)
            end = min(total_frames - 1, int(frames[-1]["frameIndex"]) + 20)
            for fi in range(start, end + 1):
                det = _find_detection(frames, fi)
                if det is not None:
                    lookup[fi] = det
        lookups.append(lookup)
    return lookups


def validate_video_id(video_id: str) -> str:
    if not UUID_PATTERN.match(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format")
    return video_id

def get_safe_video_path(video_id: str, suffix: str = ".mp4") -> Path:
    validate_video_id(video_id)
    return TEMP_DIR / f"{video_id}{suffix}"

def validate_video_file(filename: str | None, content_type: str | None):
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    if Path(filename).suffix.lower() not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}")
    if content_type and content_type not in ALLOWED_VIDEO_MIMETYPES:
        raise HTTPException(status_code=400, detail="Invalid video MIME type")

def cleanup_old_files():
    try:
        cutoff = datetime.now() - timedelta(hours=24)
        count = sum(1 for p in TEMP_DIR.glob("*")
                    if p.is_file() and datetime.fromtimestamp(p.stat().st_mtime) < cutoff and not p.unlink())
        if count: logger.info(f"Cleaned up {count} old temporary files")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")

async def periodic_cleanup():
    while True:
        await asyncio.sleep(3600)
        cleanup_old_files()

def validate_environment() -> None:
    if not os.environ.get("API_KEY"):
        if os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes"):
            logger.warning("⚠️  WARNING: Running in DEV_MODE without API_KEY - API is UNPROTECTED!")
        else:
            raise RuntimeError("FATAL: API_KEY environment variable is required!\nSet DEV_MODE=true for local development.")
    if not os.environ.get("ALLOWED_ORIGINS"):
        logger.warning("WARNING: ALLOWED_ORIGINS not set - using localhost only")

# =============================================================================
# App
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_environment()
    get_face_detector()
    logger.info(f"Face detector initialized, H.264 encoder: {_get_encoder()}")
    cleanup_old_files()
    task = asyncio.create_task(periodic_cleanup())
    yield
    task.cancel()
    try: await task
    except asyncio.CancelledError: pass
    if _thread_pool: _thread_pool.shutdown(wait=False)


app = FastAPI(title="Face Detection API", lifespan=lifespan)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "X-XSS-Protection": "1; mode=block"})
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

API_KEY = os.environ.get("API_KEY", "")
_dev_mode = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")
logger.info(f"Startup: DEV_MODE={_dev_mode}, API_KEY_set={bool(API_KEY)}")

async def verify_api_key(x_api_key: str = Header(default=None)) -> bool:
    if _dev_mode: return True
    if API_KEY and x_api_key != API_KEY:
        logger.warning("Invalid API key attempt")
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True

def get_allowed_origins() -> list[str]:
    env = os.environ.get("ALLOWED_ORIGINS", "")
    if env:
        origins = [o.strip() for o in env.split(",") if o.strip()]
        if any("*" in o for o in origins):
            raise ValueError("Wildcards not allowed in ALLOWED_ORIGINS")
        return origins
    return ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(CORSMiddleware, allow_origins=get_allowed_origins(),
                   allow_credentials=True, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type", "X-API-Key"])

# =============================================================================
# Pydantic Models
# =============================================================================

class FaceDetectionResult(BaseModel):
    bbox: List[float]; score: float

class BatchFrameRequest(BaseModel):
    frameIndex: int = Field(..., ge=0)
    image: str = Field(..., min_length=100, max_length=50_000_000)

class BatchDetectRequest(BaseModel):
    batch: List[BatchFrameRequest] = Field(..., min_length=1, max_length=25)

class BatchFrameResult(BaseModel):
    frameIndex: int; faces: List[FaceDetectionResult]

class BatchDetectResponse(BaseModel):
    results: List[BatchFrameResult]

class ExportRequest(BaseModel):
    selectedTrackIds: List[int] = Field(..., max_length=400)  # backend uses stored detection results
    padding: float = Field(default=VIDEO_PROCESSING_CONFIG["default_padding"], ge=0.0, le=VIDEO_PROCESSING_CONFIG["max_padding"])
    targetBlocks: int = Field(default=VIDEO_PROCESSING_CONFIG["default_target_blocks"], ge=VIDEO_PROCESSING_CONFIG["min_target_blocks"], le=VIDEO_PROCESSING_CONFIG["max_target_blocks"])
    sampleRate: int = Field(default=1, ge=1, le=60)

# =============================================================================
# Endpoints
# =============================================================================

@app.get("/health")
async def health(): return {"status": "ok", "model": "SCRFD-2.5G"}

@app.get("/health/auth")
async def health_authenticated(_: bool = Depends(verify_api_key)):
    return {"status": "ok", "model": "SCRFD-2.5G", "authenticated": True,
            "max_upload_mb": MAX_UPLOAD_SIZE_MB, "temp_dir": str(TEMP_DIR)}

@app.post("/upload-video")
async def upload_video(request: Request, file: UploadFile = File(...), _: bool = Depends(verify_api_key)):
    validate_video_file(file.filename or "video.mp4", file.content_type)
    if MAX_UPLOAD_SIZE_MB > 0:
        cl = request.headers.get("content-length")
        if cl:
            try:
                if int(cl) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
            except ValueError: pass

    video_id = str(uuid.uuid4())
    video_path = TEMP_DIR / f"{video_id}.mp4"
    max_size = MAX_UPLOAD_SIZE_MB * 1024 * 1024 if MAX_UPLOAD_SIZE_MB > 0 else 0
    size = 0
    try:
        with open(video_path, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if max_size and size > max_size:
                    video_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
                f.write(chunk)
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            video_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Invalid video file.")
        fps = float(cap.get(cv2.CAP_PROP_FPS)) or 30.0
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        logger.info(f"Uploaded {video_id} ({size/1024/1024:.1f}MB, {fps}fps, {width}x{height}, {frame_count} frames)")
        return {"videoId": video_id, "metadata": {"fps": fps, "width": width, "height": height, "frameCount": frame_count}}
    except HTTPException: raise
    except Exception as e:
        logger.error(f"Upload error: {e}"); video_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to upload video")


@app.post("/detect-video/{video_id}")
def detect_video_id_endpoint(video_id: str, sample_rate: int = 3, _: bool = Depends(verify_api_key)):
    video_path = get_safe_video_path(video_id, ".mp4")
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    def generate():
        try:
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                yield json.dumps({"error": "Could not open video file"}) + "\n"; return
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            cap.release()

            total_steps = max(1, (total_frames + sample_rate - 1) // sample_rate) if total_frames > 0 else 1
            completed_steps = 0
            detections_per_frame = {}
            pool = get_thread_pool()
            pending_futures = []
            MAX_PENDING = DETECTOR_POOL_SIZE * 2

            def drain_one():
                nonlocal completed_steps
                idx, fut = pending_futures.pop(0)
                try:
                    faces = fut.result()
                    if faces: detections_per_frame[idx] = faces
                except Exception as e:
                    logger.error(f"Detection failed frame {idx}: {e}")
                completed_steps += 1
                return json.dumps({"type": "progress", "progress": round(completed_steps / total_steps * 80, 1)}) + "\n"

            # Prefer ffmpeg sampled decode path when available, else fallback to OpenCV seek.
            if shutil.which("ffmpeg") and width > 0 and height > 0 and total_frames > 0:
                frame_size = width * height * 3
                proc = subprocess.Popen(
                    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video_path),
                     "-vf", f"select=not(mod(n\\,{sample_rate}))", "-vsync", "vfr",
                     "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

                fq: queue.Queue = queue.Queue(maxsize=MAX_PENDING * 2)

                def _reader():
                    emitted = 0
                    try:
                        while True:
                            raw = proc.stdout.read(frame_size)
                            if not raw or len(raw) < frame_size: break
                            fq.put((emitted * sample_rate, np.frombuffer(raw, np.uint8).reshape((height, width, 3)).copy()))
                            emitted += 1
                    finally:
                        fq.put(None)

                threading.Thread(target=_reader, daemon=True).start()
                while True:
                    item = fq.get()
                    if item is None: break
                    fi, frame = item
                    pending_futures.append((fi, pool.submit(detect_faces, frame)))
                    while len(pending_futures) >= MAX_PENDING:
                        yield drain_one()
                proc.wait(timeout=30)
            else:
                cap = cv2.VideoCapture(str(video_path))
                if not cap.isOpened():
                    yield json.dumps({"error": "Could not open video file"}) + "\n"; return
                target_idx = current_frame = 0
                while True:
                    if total_frames > 0 and target_idx >= total_frames: break
                    if target_idx != current_frame and not cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx): break
                    ret, frame = cap.read()
                    if not ret: break
                    current_frame = target_idx + 1
                    pending_futures.append((target_idx, pool.submit(detect_faces, frame)))
                    while len(pending_futures) >= MAX_PENDING:
                        yield drain_one()
                    target_idx += sample_rate
                cap.release()

            while pending_futures:
                yield drain_one()

            logger.info(f"Detection done for {video_id}: {len(detections_per_frame)} frames with faces")
            yield json.dumps({"type": "progress", "progress": 85}) + "\n"
            tracks = track_detections(detections_per_frame)
            logger.info(f"Tracking done for {video_id}: {len(tracks)} tracks")
            store_tracks(video_id, tracks)  # store server-side — never resent from frontend
            yield json.dumps({"type": "progress", "progress": 100}) + "\n"
            yield json.dumps({"type": "results", "results": tracks}) + "\n"
        except Exception as e:
            logger.error(f"Video detection stream error: {e}")
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")



@app.post("/export/{video_id}")
def export_video(video_id: str, export_request: ExportRequest, _: bool = Depends(verify_api_key)):
    input_path = get_safe_video_path(video_id, ".mp4")
    if not input_path.exists():
        raise HTTPException(status_code=404, detail="Video not found. Please upload again.")
    tracks = get_tracks(video_id)
    if tracks is None:
        raise HTTPException(status_code=400, detail="Detection results not found. Please re-run detection.")

    output_path = get_safe_video_path(video_id, "_blurred.mp4")

    def generate():
        cap = out = ffmpeg_proc = dec = None
        try:
            tracks_map = {t["id"]: t for t in tracks if t["id"] in export_request.selectedTrackIds}
            cap = cv2.VideoCapture(str(input_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = max(int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), 1)
            cap.release(); cap = None

            track_lookup_dicts = _precompute_track_lookups([t["frames"] for t in tracks_map.values()], total_frames)
            pad, target_blocks = export_request.padding, export_request.targetBlocks
            pool = get_thread_pool()
            chunk, frames_written = [], 0
            chunk_size = DETECTOR_POOL_SIZE * 4
            use_ffmpeg = shutil.which("ffmpeg") and width > 0 and height > 0

            yield json.dumps({"type": "progress", "progress": 5}) + "\n"

            if use_ffmpeg:
                enc = _get_encoder()
                ffmpeg_proc = subprocess.Popen(
                    ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                     "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps),
                     "-i", "pipe:0", "-i", str(input_path),
                     *_ENCODER_ARGS[enc],
                     "-pix_fmt", "yuv420p", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0?", "-shortest",
                     str(output_path)],
                    stdin=subprocess.PIPE, stderr=subprocess.PIPE)
                dec = subprocess.Popen(
                    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(input_path),
                     "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            else:
                raw_path = get_safe_video_path(video_id, "_raw.mp4")
                out = cv2.VideoWriter(str(raw_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
                cap = cv2.VideoCapture(str(input_path))

            def write_frame(f):
                nonlocal frames_written
                if ffmpeg_proc:
                    if ffmpeg_proc.poll() is not None:
                        raise RuntimeError(f"ffmpeg exited: {ffmpeg_proc.stderr.read().decode(errors='ignore')}")
                    try:
                        ffmpeg_proc.stdin.write(f.tobytes())
                    except (BrokenPipeError, ValueError):
                        raise RuntimeError(f"ffmpeg pipe broken: {ffmpeg_proc.stderr.read().decode(errors='ignore')}")
                else:
                    out.write(f)
                frames_written += 1

            def flush_chunk(ch):
                results = sorted([f.result() for f in [pool.submit(_blur_frame, a) for a in ch]], key=lambda x: x[0])
                for _, f in results:
                    write_frame(f)
                return json.dumps({"type": "progress", "progress": min(70, round(5 + frames_written / total_frames * 65, 1))}) + "\n"

            frame_size = width * height * 3
            fi = 0
            while True:
                if dec:
                    raw = dec.stdout.read(frame_size)
                    if not raw or len(raw) < frame_size: break
                    frame = np.frombuffer(raw, np.uint8).reshape((height, width, 3)).copy()
                else:
                    ret, frame = cap.read()
                    if not ret: break

                # Fast path: no face on this frame — write directly, skip thread pool
                if not any(fi in lu for lu in track_lookup_dicts):
                    write_frame(frame)
                    if frames_written % 60 == 0:
                        yield json.dumps({"type": "progress", "progress": min(70, round(5 + frames_written / total_frames * 65, 1))}) + "\n"
                    fi += 1
                    continue

                chunk.append((fi, frame, track_lookup_dicts, pad, target_blocks, width, height))
                if len(chunk) >= chunk_size:
                    yield flush_chunk(chunk); chunk = []
                fi += 1

            if chunk: yield flush_chunk(chunk)
            if dec: dec.wait(timeout=30)

            yield json.dumps({"type": "progress", "progress": 75}) + "\n"

            if ffmpeg_proc:
                try:
                    if ffmpeg_proc.stdin and not ffmpeg_proc.stdin.closed:
                        ffmpeg_proc.stdin.close()
                except Exception: pass
                try:
                    ffmpeg_proc.wait(timeout=600)
                    stderr_data = ffmpeg_proc.stderr.read()
                except subprocess.TimeoutExpired:
                    ffmpeg_proc.kill(); ffmpeg_proc.wait()
                    stderr_data = ffmpeg_proc.stderr.read()
                if ffmpeg_proc.returncode != 0:
                    logger.error(f"ffmpeg failed: {stderr_data.decode(errors='ignore')}")
                    yield json.dumps({"type": "error", "error": "Failed to encode video"}) + "\n"; return
            elif out:
                out.release(); out = None
                raw_path = get_safe_video_path(video_id, "_raw.mp4")
                logger.warning("ffmpeg not found — serving uncompressed output")
                raw_path.rename(output_path)

            yield json.dumps({"type": "progress", "progress": 90}) + "\n"
            logger.info(f"Export complete: {video_id}")
            yield json.dumps({"type": "done"}) + "\n"

        except Exception as e:
            logger.error(f"Export error {video_id}: {e}")
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"
        finally:
            if cap: cap.release()
            if out: out.release()
            if dec:
                try: dec.stdout.close()
                except Exception: pass
            if ffmpeg_proc:
                try:
                    if ffmpeg_proc.stdin and not ffmpeg_proc.stdin.closed: ffmpeg_proc.stdin.close()
                except Exception: pass

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/download/{video_id}")
async def download_video(video_id: str, _: bool = Depends(verify_api_key)):
    output_path = get_safe_video_path(video_id, "_blurred.mp4")
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Blurred video not found. Please export first.")
    return FileResponse(str(output_path), media_type="video/mp4", filename="blurred-video.mp4")


def _process_batch_frame(frame_index: int, image_data: str) -> dict:
    import base64
    try:
        raw = image_data.split(",", 1)[-1] if "," in image_data else image_data
        image = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
        if image is None: return {"frameIndex": frame_index, "faces": []}
        faces = detect_faces(image)
        return {"frameIndex": frame_index, "faces": [{"bbox": f["bbox"], "score": f["score"]} for f in faces]}
    except Exception as e:
        logger.error(f"Error processing frame {frame_index}: {e}")
        return {"frameIndex": frame_index, "faces": []}


@app.post("/detect-batch", response_model=BatchDetectResponse)
async def detect_batch_endpoint(batch_request: BatchDetectRequest, _: bool = Depends(verify_api_key)):
    try:
        loop = asyncio.get_event_loop()
        pool = get_thread_pool()
        results = await asyncio.gather(*[
            loop.run_in_executor(pool, _process_batch_frame, fr.frameIndex, fr.image)
            for fr in batch_request.batch
        ])
        return BatchDetectResponse(results=[
            BatchFrameResult(frameIndex=r["frameIndex"],
                             faces=[FaceDetectionResult(bbox=f["bbox"], score=f["score"]) for f in r["faces"]])
            for r in results
        ])
    except Exception as e:
        logger.error(f"Batch detection error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect faces in batch")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)