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
from datetime import datetime, timedelta
from typing import List

from detector import detect_faces, get_face_detector, get_thread_pool, DETECTOR_POOL_SIZE
from tracker import track_detections, _precompute_track_lookups
from blur import _blur_frame
from reid import merge_tracks_by_identity, get_reid_model

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

VIDEO_PROCESSING_CONFIG = {"default_padding": 0.4, "default_target_blocks": 8, "max_padding": 2.0, "max_target_blocks": 24, "min_target_blocks": 4}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}
ALLOWED_VIDEO_MIMETYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Suppress noisy FFmpeg/H.264 decoder warnings (e.g. "mmco: unref short failure")
# that come from slightly malformed but perfectly readable video files.
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")  # AV_LOG_QUIET

TEMP_DIR = Path(tempfile.gettempdir()) / "blurthatguy"
TEMP_DIR.mkdir(exist_ok=True)
CHUNK_SIZE = 1024 * 1024*2
UUID_PATTERN = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')

try:
    MAX_UPLOAD_SIZE_MB = max(1, int(os.environ.get("MAX_UPLOAD_SIZE_MB", "")))
except Exception:
    MAX_UPLOAD_SIZE_MB = 0

# =============================================================================
# H.264 encoder selection
# =============================================================================

_h264_encoder: str | None = None


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
                ["ffmpeg", "-hide_banner", "-loglevel", "fatal",
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
    "libx264":           ["-c:v", "libx264", "-crf", "26", "-preset", "ultrafast", "-threads", "0"],
}

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
        cutoff = datetime.now() - timedelta(hours=1)
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
    get_reid_model()
    logger.info(f"Face detector initialized, H.264 encoder: {_get_encoder()}")
    cleanup_old_files()
    task = asyncio.create_task(periodic_cleanup())
    yield
    task.cancel()
    try: await task
    except asyncio.CancelledError: pass
    pool = get_thread_pool()
    if pool: pool.shutdown(wait=False)


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
    blurMode: str = Field(default="pixelate", pattern="^(pixelate|blackout)$")

# =============================================================================
# Endpoints
# =============================================================================

@app.get("/health")
async def health(): return {"status": "ok", "model": "SCRFD-2.5G"}

@app.get("/health/auth")
async def health_authenticated(_: bool = Depends(verify_api_key)):
    return {"status": "ok", "model": "SCRFD-2.5G", "authenticated": True,
            "max_upload_mb": MAX_UPLOAD_SIZE_MB}

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
        logger.info(f"Uploaded video {video_id}")
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
            cut_frames: set[int] = set()   # frame indices where a hard scene cut was detected
            pool = get_thread_pool()
            pending_futures = []
            MAX_PENDING = DETECTOR_POOL_SIZE * 2

            # Cut detection: compare consecutive sampled frames on a tiny
            # downscaled grayscale image. MAD > threshold = hard cut.
            # Threshold 45 (was 28): ignores camera pans, slow zooms, and
            # lighting changes which read 15-35. True hard cuts read 50-120.
            # _MIN_CUT_GAP: ignore cuts within N sampled frames of the last
            # one — prevents a single slow pan triggering multiple cuts.
            _CUT_THUMB = (64, 36)
            _CUT_THRESHOLD = 45.0
            _MIN_CUT_GAP = 8   # in sampled-frame units (= 8 * sample_rate real frames)
            _prev_thumb: np.ndarray | None = None
            _prev_fi: int = -1
            _last_cut_fi: int = -999


            def _check_cut(fi: int, frame: np.ndarray) -> None:
                nonlocal _prev_thumb, _prev_fi, _last_cut_fi
                small = cv2.resize(frame, _CUT_THUMB)
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
                if _prev_thumb is not None:
                    mad = float(np.mean(np.abs(gray - _prev_thumb)))
                    sampled_gap = (fi - _last_cut_fi) // sample_rate
                    if mad > _CUT_THRESHOLD and sampled_gap >= _MIN_CUT_GAP:
                        cut_frames.add(fi)
                        _last_cut_fi = fi
                        logger.debug(f"Scene cut at frame {fi} (MAD={mad:.1f})")
                _prev_thumb = gray
                _prev_fi = fi

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
                    ["ffmpeg", "-hide_banner", "-loglevel", "fatal", "-i", str(video_path),
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
                    _check_cut(fi, frame)
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
                    _check_cut(target_idx, frame)
                    pending_futures.append((target_idx, pool.submit(detect_faces, frame)))
                    while len(pending_futures) >= MAX_PENDING:
                        yield drain_one()
                    target_idx += sample_rate
                cap.release()

            while pending_futures:
                yield drain_one()

            logger.info(f"Detection done for {video_id}: {len(detections_per_frame)} frames with faces, {len(cut_frames)} scene cuts detected")
            yield json.dumps({"type": "progress", "progress": 80}) + "\n"

            yield json.dumps({"type": "progress", "progress": 85}) + "\n"
            tracks = track_detections(detections_per_frame, cut_frames)
            logger.info(f"Tracking done for {video_id}: {len(tracks)} tracks")
            tracks = merge_tracks_by_identity(tracks, video_path)
            # Strip numpy embeddings from frame entries before JSON serialization
            for t in tracks:
                for f in t.get("frames", []):
                    f.pop("emb", None)
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
            # Convert to set for O(1) membership — also catches any stray type
            # mismatches by normalising both sides to int.
            selected_set = set(int(i) for i in export_request.selectedTrackIds)
            tracks_map = {t["id"]: t for t in tracks if int(t["id"]) in selected_set}
            logger.info(
                f"Export {video_id}: requested ids={sorted(selected_set)}, "
                f"matched {len(tracks_map)}/{len(tracks)} stored tracks"
            )
            if not tracks_map:
                logger.warning(
                    f"Export {video_id}: no tracks matched — stored ids sample: "
                    f"{sorted(t['id'] for t in tracks)[:20]}"
                )

            cap = cv2.VideoCapture(str(input_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = max(int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), 1)
            cap.release(); cap = None

            track_lookup_dicts = _precompute_track_lookups([t["frames"] for t in tracks_map.values()], total_frames)
            pad, target_blocks, blur_mode = export_request.padding, export_request.targetBlocks, export_request.blurMode
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

                # Drain stderr in a background thread to prevent the pipe buffer
                # filling up (~64 KB on Linux) which would deadlock the stdin write loop.
                _stderr_chunks: list[bytes] = []

                def _drain_stderr():
                    try:
                        for chunk in iter(lambda: ffmpeg_proc.stderr.read(4096), b""):
                            _stderr_chunks.append(chunk)
                    except Exception:
                        pass

                _stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
                _stderr_thread.start()
                dec = subprocess.Popen(
                    ["ffmpeg", "-hide_banner", "-loglevel", "fatal", "-i", str(input_path),
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
                        err = b"".join(_stderr_chunks).decode(errors="ignore")
                        raise RuntimeError(f"ffmpeg exited early: {err}")
                    try:
                        ffmpeg_proc.stdin.write(f.tobytes())
                    except (BrokenPipeError, ValueError):
                        err = b"".join(_stderr_chunks).decode(errors="ignore")
                        raise RuntimeError(f"ffmpeg pipe broken: {err}")
                else:
                    out.write(f)
                frames_written += 1

            def flush_chunk(ch):
                results = sorted([f.result() for f in [pool.submit(_blur_frame, a) for a in ch]], key=lambda x: x[0])
                for _, f in results:
                    write_frame(f)
                return json.dumps({"type": "progress", "progress": min(70, round(5 + frames_written / total_frames * 65, 1))}) + "\n"

            frame_size = width * height * 3

            # ── Reader thread: drain the ffmpeg decode pipe independently so the
            # decoder process is never stalled by Python's encode-side backpressure.
            # The queue acts as a bounded buffer between decoder and processor.
            _read_queue: queue.Queue = queue.Queue(maxsize=chunk_size * 3)

            def _frame_reader():
                fi_r = 0
                try:
                    if dec:
                        while True:
                            raw = dec.stdout.read(frame_size)
                            if not raw or len(raw) < frame_size:
                                break
                            frame = np.frombuffer(raw, np.uint8).reshape((height, width, 3)).copy()
                            _read_queue.put((fi_r, frame))
                            fi_r += 1
                    else:
                        while True:
                            ret, frame = cap.read()
                            if not ret:
                                break
                            _read_queue.put((fi_r, frame))
                            fi_r += 1
                finally:
                    _read_queue.put(None)  # sentinel

            _reader_thread = threading.Thread(target=_frame_reader, daemon=True)
            _reader_thread.start()

            while True:
                item = _read_queue.get()
                if item is None:
                    break
                fi, frame = item

                # Fast path: no face on this frame — write directly, skip thread pool
                if not any(fi in lu for lu in track_lookup_dicts):
                    write_frame(frame)
                    if frames_written % 30 == 0:
                        yield json.dumps({"type": "progress", "progress": min(70, round(5 + frames_written / total_frames * 65, 1))}) + "\n"
                    continue

                chunk.append((fi, frame, track_lookup_dicts, pad, target_blocks, width, height, blur_mode))
                if len(chunk) >= chunk_size:
                    yield flush_chunk(chunk); chunk = []

            _reader_thread.join(timeout=30)
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
                    _stderr_thread.join(timeout=5)
                    stderr_data = b"".join(_stderr_chunks)
                except subprocess.TimeoutExpired:
                    ffmpeg_proc.kill(); ffmpeg_proc.wait()
                    _stderr_thread.join(timeout=5)
                    stderr_data = b"".join(_stderr_chunks)
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