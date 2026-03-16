from contextlib import asynccontextmanager
import asyncio
import base64
import logging
import os
import re
import uuid
from typing import List

import cv2
import numpy as np
from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from blur import _blur_frame
from detector import DETECTOR_POOL_SIZE, get_face_detector, get_thread_pool
from job_runner import cancel_detection_job, register_cancel_token, run_queued_detection_job, unregister_cancel_token
from queue_manager import (
    create_redis_client,
    evict_stale_jobs,
    get_job_status,
    on_job_finish,
    set_job_status,
    touch_job_heartbeat,
    try_admit,
)
from reid import get_reid_model
from services.config import (
    CHUNK_SIZE,
    MAX_UPLOAD_SIZE_MB,
    VIDEO_PROCESSING_CONFIG,
    cleanup_old_files,
    get_allowed_origins,
    get_safe_video_path,
    periodic_cleanup,
    validate_environment,
    validate_video_file,
)
from services.processor import ENCODER_ARGS, apply_job_thread_budget, get_encoder, process_detection
from services.storage import get_job_result, get_tracks, store_job_result
from stream_generators import detect_stream_generator, export_stream_generator
from tracker import _precompute_track_lookups


# ===== Logging =====
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class _AccessLogFilter(logging.Filter):
    """Hide noisy successful queue-poll access logs."""

    _status_poll_re = re.compile(r'"GET /job/[^\s]+/status(?:\?[^\s"]*)? HTTP/[^\"]+" 200\b')

    def filter(self, record: logging.LogRecord) -> bool:
        return not self._status_poll_re.search(record.getMessage())


def _configure_access_log_filter() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    for existing_filter in access_logger.filters:
        if isinstance(existing_filter, _AccessLogFilter):
            return
    access_logger.addFilter(_AccessLogFilter())


_configure_access_log_filter()
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")


# ===== Auth =====
async def verify_api_key(x_api_key: str = Header(default=None)) -> bool:
    api_key = os.environ.get("API_KEY", "")
    dev_mode = os.environ.get("DEV_MODE", "").lower() in ("true", "1", "yes")

    if dev_mode:
        return True
    if api_key and x_api_key != api_key:
        logger.warning("Invalid API key attempt")
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True


# ===== Request Models =====
class FaceDetectionResult(BaseModel):
    bbox: List[float]
    score: float


class BatchFrameRequest(BaseModel):
    frameIndex: int = Field(..., ge=0)
    image: str = Field(..., min_length=100, max_length=50_000_000)


class BatchDetectRequest(BaseModel):
    batch: List[BatchFrameRequest] = Field(..., min_length=1, max_length=25)


class BatchFrameResult(BaseModel):
    frameIndex: int
    faces: List[FaceDetectionResult]


class BatchDetectResponse(BaseModel):
    results: List[BatchFrameResult]


class ExportRequest(BaseModel):
    selectedTrackIds: List[int] = Field(..., max_length=400)
    padding: float = Field(
        default=VIDEO_PROCESSING_CONFIG["default_padding"],
        ge=0.0,
        le=VIDEO_PROCESSING_CONFIG["max_padding"],
    )
    targetBlocks: int = Field(
        default=VIDEO_PROCESSING_CONFIG["default_target_blocks"],
        ge=VIDEO_PROCESSING_CONFIG["min_target_blocks"],
        le=VIDEO_PROCESSING_CONFIG["max_target_blocks"],
    )
    sampleRate: int = Field(default=1, ge=1, le=60)
    blurMode: str = Field(default="pixelate", pattern="^(pixelate|blackout)$")


# ===== App Lifecycle =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_environment()
    get_face_detector()
    get_reid_model()

    app.state.redis_client = create_redis_client()
    app.state.logger = logger

    logger.info(f"Face detector initialized, H.264 encoder: {get_encoder()}")
    cleanup_old_files()
    cleanup_task = asyncio.create_task(periodic_cleanup())

    yield

    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    pool = get_thread_pool()
    if pool:
        pool.shutdown(wait=False)


app = FastAPI(title="Face Detection API", lifespan=lifespan)


# ===== Middleware =====
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.update(
        {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
        }
    )
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)


# ===== Endpoint Helpers =====
def _get_redis_client(request: Request):
    redis_client = getattr(request.app.state, "redis_client", None)
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis is not available")
    return redis_client


def _process_batch_frame(frame_index: int, image_data: str) -> dict:
    try:
        raw = image_data.split(",", 1)[-1] if "," in image_data else image_data
        image = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return {"frameIndex": frame_index, "faces": []}
        from detector import detect_faces

        faces = detect_faces(image)
        return {"frameIndex": frame_index, "faces": [{"bbox": f["bbox"], "score": f["score"]} for f in faces]}
    except Exception as e:
        return {"frameIndex": frame_index, "faces": [], "error": str(e)}


# ===== Video Endpoints =====
@app.get("/health")
async def health():
    return {"status": "ok", "model": "SCRFD-2.5G"}


@app.get("/health/auth")
async def health_authenticated(_: bool = Depends(verify_api_key)):
    return {
        "status": "ok",
        "model": "SCRFD-2.5G",
        "authenticated": True,
        "max_upload_mb": MAX_UPLOAD_SIZE_MB,
    }


@app.post("/upload-video")
async def upload_video(request: Request, file: UploadFile = File(...), _: bool = Depends(verify_api_key)):
    validate_video_file(file.filename or "video.mp4", file.content_type)
    if MAX_UPLOAD_SIZE_MB > 0:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
            except ValueError:
                pass

    video_id = str(uuid.uuid4())
    video_path = get_safe_video_path(video_id, ".mp4")
    max_size = MAX_UPLOAD_SIZE_MB * 1024 * 1024 if MAX_UPLOAD_SIZE_MB > 0 else 0
    size = 0
    try:
        with open(video_path, "wb") as handle:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if max_size and size > max_size:
                    video_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
                handle.write(chunk)

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            video_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Invalid video file.")

        fps = float(cap.get(cv2.CAP_PROP_FPS)) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        request.app.state.logger.info(f"Uploaded video {video_id}")
        return {
            "videoId": video_id,
            "metadata": {"fps": fps, "width": width, "height": height, "frameCount": frame_count},
        }
    except HTTPException:
        raise
    except Exception as e:
        request.app.state.logger.error(f"Upload error: {e}")
        video_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to upload video")


@app.post("/detect-video/{video_id}")
def detect_video_id_endpoint(
    video_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    sample_rate: int = 3,
    _: bool = Depends(verify_api_key),
):
    redis_client = _get_redis_client(request)
    video_path = get_safe_video_path(video_id, ".mp4")
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    job_id = str(uuid.uuid4())
    admitted = try_admit(redis_client, job_id)

    if not admitted:
        background_tasks.add_task(
            run_queued_detection_job,
            redis_client,
            job_id,
            video_id,
            video_path,
            sample_rate,
            process_detection,
            store_job_result,
            apply_job_thread_budget,
            request.app.state.logger,
        )
        return JSONResponse(status_code=202, content={"job_id": job_id, "status": "queued"})

    apply_job_thread_budget(redis_client, job_id)
    stream_budget = get_job_status(redis_client, job_id).get("thread_budget")
    stream_token = register_cancel_token(job_id)
    touch_job_heartbeat(redis_client, job_id)

    return StreamingResponse(
        detect_stream_generator(
            r=redis_client,
            job_id=job_id,
            video_id=video_id,
            video_path=video_path,
            sample_rate=sample_rate,
            stream_budget=stream_budget,
            stream_token=stream_token,
            process_detection=process_detection,
            touch_job_heartbeat=touch_job_heartbeat,
            set_job_status=set_job_status,
            unregister_cancel_token=unregister_cancel_token,
            on_job_finish=on_job_finish,
            logger=request.app.state.logger,
        ),
        media_type="application/x-ndjson",
        headers={"X-Job-Id": job_id, "Access-Control-Expose-Headers": "X-Job-Id"},
    )


@app.post("/export/{video_id}")
def export_video(video_id: str, request: Request, export_request: ExportRequest, _: bool = Depends(verify_api_key)):
    input_path = get_safe_video_path(video_id, ".mp4")
    if not input_path.exists():
        raise HTTPException(status_code=404, detail="Video not found. Please upload again.")

    tracks = get_tracks(video_id)
    if tracks is None:
        raise HTTPException(status_code=400, detail="Detection results not found. Please re-run detection.")

    output_path = get_safe_video_path(video_id, "_blurred.mp4")
    return StreamingResponse(
        export_stream_generator(
            video_id=video_id,
            export_request=export_request,
            tracks=tracks,
            input_path=input_path,
            output_path=output_path,
            precompute_track_lookups=_precompute_track_lookups,
            get_thread_pool=get_thread_pool,
            detector_pool_size=DETECTOR_POOL_SIZE,
            get_encoder=get_encoder,
            encoder_args=ENCODER_ARGS,
            get_safe_video_path=get_safe_video_path,
            blur_frame=_blur_frame,
            logger=request.app.state.logger,
        ),
        media_type="application/x-ndjson",
    )


@app.get("/download/{video_id}")
async def download_video(video_id: str, _: bool = Depends(verify_api_key)):
    output_path = get_safe_video_path(video_id, "_blurred.mp4")
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Blurred video not found. Please export first.")
    return FileResponse(str(output_path), media_type="video/mp4", filename="blurred-video.mp4")


@app.post("/detect-batch", response_model=BatchDetectResponse)
async def detect_batch_endpoint(batch_request: BatchDetectRequest, _: bool = Depends(verify_api_key)):
    try:
        loop = asyncio.get_running_loop()
        pool = get_thread_pool()
        results = await asyncio.gather(
            *[loop.run_in_executor(pool, _process_batch_frame, fr.frameIndex, fr.image) for fr in batch_request.batch]
        )
        return BatchDetectResponse(
            results=[
                BatchFrameResult(
                    frameIndex=result["frameIndex"],
                    faces=[FaceDetectionResult(bbox=f["bbox"], score=f["score"]) for f in result["faces"]],
                )
                for result in results
            ]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to detect faces in batch: {e}")


@app.post("/submit-job")
async def submit_job(request: Request, file: UploadFile = File(...), _: bool = Depends(verify_api_key)):
    validate_video_file(file.filename or "video.mp4", file.content_type)
    if MAX_UPLOAD_SIZE_MB > 0:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
            except ValueError:
                pass

    video_id = str(uuid.uuid4())
    video_path = get_safe_video_path(video_id, ".mp4")
    max_size = MAX_UPLOAD_SIZE_MB * 1024 * 1024 if MAX_UPLOAD_SIZE_MB > 0 else 0
    size = 0
    try:
        with open(video_path, "wb") as handle:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if max_size and size > max_size:
                    video_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"Video too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB.")
                handle.write(chunk)

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            video_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Invalid video file.")

        fps = float(cap.get(cv2.CAP_PROP_FPS)) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        request.app.state.logger.info(f"Job submitted for video {video_id}")
        return JSONResponse(
            {
                "jobId": video_id,
                "status": "submitted",
                "videoId": video_id,
                "metadata": {"fps": fps, "width": width, "height": height, "frameCount": frame_count},
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        request.app.state.logger.error(f"Job submission error: {e}")
        video_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to submit job")


# ===== Job Endpoints =====
@app.post("/job/{job_id}/cancel")
async def cancel_job(job_id: str, request: Request, _: bool = Depends(verify_api_key)):
    redis_client = _get_redis_client(request)
    cancel_detection_job(redis_client, job_id, request.app.state.logger)
    return {"status": "cancelled"}


@app.get("/job/{job_id}/status")
async def job_status(job_id: str, request: Request, _: bool = Depends(verify_api_key)):
    redis_client = _get_redis_client(request)
    evict_stale_jobs(redis_client)
    status = get_job_status(redis_client, job_id)
    if status["status"] is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return status


@app.get("/job/{job_id}/result")
async def job_result(job_id: str, _: bool = Depends(verify_api_key)):
    result = get_job_result(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Job result not found")
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

