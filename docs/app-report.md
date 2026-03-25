# BlurThatGuy - Full Application Report

A privacy-focused web application that detects, tracks, and selectively blurs faces in video. Users upload a video, the AI identifies every face, and the user picks which faces to anonymize. The result is a downloadable video with pixel-perfect face blurring.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Backend](#3-backend)
   - [3.1 Entry Point — main.py](#31-entry-point--mainpy)
   - [3.2 Configuration — config.py](#32-configuration--configpy)
   - [3.3 Storage — storage.py](#33-storage--storagepy)
   - [3.4 Pipeline: Detector — detector.py](#34-pipeline-detector--detectorpy)
   - [3.5 Pipeline: Processor — processor.py](#35-pipeline-processor--processorpy)
   - [3.6 Pipeline: Tracker — tracker.py](#36-pipeline-tracker--trackerpy)
   - [3.7 Pipeline: ReID — reid.py](#37-pipeline-reid--reidpy)
   - [3.8 Pipeline: Blur — blur.py](#38-pipeline-blur--blurpy)
   - [3.9 Jobs: Queue Manager — queue_manager.py](#39-jobs-queue-manager--queue_managerpy)
   - [3.10 Jobs: Job Runner — job_runner.py](#310-jobs-job-runner--job_runnerpy)
   - [3.11 Jobs: Stream Generators — stream_generators.py](#311-jobs-stream-generators--stream_generatorspy)
4. [Frontend](#4-frontend)
   - [4.1 Layout & Landing Page](#41-layout--landing-page)
   - [4.2 Upload Page — The Main Workflow](#42-upload-page--the-main-workflow)
   - [4.3 Upload Hooks](#43-upload-hooks)
   - [4.4 Upload Components](#44-upload-components)
   - [4.5 Shared Components](#45-shared-components)
   - [4.6 Auth Pages — Login, Signup, Settings](#46-auth-pages--login-signup-settings)
   - [4.7 My Videos Page](#47-my-videos-page)
5. [Lib](#5-lib)
   - [5.1 Face Client — faceClient.ts](#51-face-client--faceclientts)
   - [5.2 Backend Proxy — backendProxy.ts](#52-backend-proxy--backendproxyts)
   - [5.3 Supabase Clients](#53-supabase-clients)
   - [5.4 Utilities](#54-utilities)
   - [5.5 Types](#55-types)
6. [API Routes](#6-api-routes)
   - [6.1 Backend Proxy Routes](#61-backend-proxy-routes)
   - [6.2 User Video Routes (Auth Required)](#62-user-video-routes-auth-required)
   - [6.3 User Account Routes](#63-user-account-routes)
7. [Data Flow — End to End](#7-data-flow--end-to-end)
8. [Deployment](#8-deployment)

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Python, FastAPI, Uvicorn |
| AI Models | SCRFD-2.5G (face detection), ArcFace w600k_r50 (re-identification) |
| Inference | ONNX Runtime (CPU) |
| Video | FFmpeg (decode/encode), OpenCV (fallback) |
| Queue | Redis 7 (in-memory, no persistence) |
| Auth | Supabase (email/password) |
| Storage | AWS S3 (saved videos), Supabase Postgres (metadata) |
| Deploy | Docker Compose (frontend + backend + Redis) |

---

## 2. Project Structure

```
BlurThatGuyProject/
├── app/                          # Next.js pages & API routes
│   ├── (landing)/                # Landing page (route group)
│   │   ├── page.tsx              # Hero, features, MockUI
│   │   ├── hooks/                # useLandingHashSync
│   │   └── components/           # Navbar, FeatureCard, Footer, MockUI
│   ├── upload/                   # Main processing workflow
│   │   ├── page.tsx              # Upload → Detect → Select steps
│   │   ├── hooks/                # useVideoUpload, useFaceDetection, useVideoExport
│   │   └── components/           # DropZone, FaceGallery, PlayerWithMask, etc.
│   ├── login/page.tsx            # Login form
│   ├── signup/page.tsx           # Registration form
│   ├── settings/page.tsx         # Account settings
│   ├── my-videos/page.tsx        # Saved video library
│   └── api/                      # Next.js API routes (proxy to backend)
│       ├── health/
│       ├── upload-video/
│       ├── detect-video/[videoId]/
│       ├── export/[videoId]/
│       ├── download/[videoId]/
│       ├── job/[jobId]/          # status, result, cancel
│       ├── videos/               # presign, save, delete, list
│       └── user/delete/
├── components/                   # Shared UI components
│   ├── Alert.tsx
│   ├── BackgroundBlobs.tsx
│   ├── Header.tsx
│   ├── Logo.tsx
│   └── UserDropdown.tsx
├── lib/                          # Shared libraries
│   ├── config.ts                 # API_URL constant
│   ├── services/faceClient.ts    # Backend communication client
│   ├── server/backendProxy.ts    # Server-side proxy helper
│   ├── supabase/                 # client.ts, server.ts, admin.ts
│   └── utils/format.ts           # formatFileSize, formatDuration, formatDate
├── types/                        # TypeScript type definitions
│   ├── track.ts                  # BBox, Detection, Track
│   ├── blur.ts                   # BlurMode
│   └── video.ts                  # VideoRecord
├── backend/                      # Python FastAPI backend
│   ├── main.py                   # HTTP endpoints
│   ├── config.py                 # Settings & validation
│   ├── storage.py                # In-memory track storage
│   ├── auth.py                   # API key verification
│   ├── pipeline/                 # AI processing modules
│   │   ├── detector.py           # SCRFD face detection
│   │   ├── processor.py          # Detection orchestrator
│   │   ├── tracker.py            # IOU + distance tracker
│   │   ├── reid.py               # ArcFace re-identification
│   │   └── blur.py               # Pixelation/blackout
│   ├── jobs/                     # Job queue system
│   │   ├── queue_manager.py      # Redis queue & thread budgeting
│   │   ├── job_runner.py         # Background job execution
│   │   └── stream_generators.py  # NDJSON streaming
│   └── models/                   # ONNX model files
│       ├── scrfd_2.5g.onnx
│       └── w600k_r50.onnx
└── docker-compose.yml
```

---

## 3. Backend

### 3.1 Entry Point — main.py

The FastAPI server. All HTTP endpoints live here, delegating actual work to pipeline and jobs modules.

**Key endpoints:**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/upload-video` | Upload video, extract metadata |
| POST | `/detect-video/{video_id}` | Stream face detection (or queue job) |
| POST | `/export/{video_id}` | Blur selected faces, encode output |
| GET | `/download/{video_id}` | Download blurred video file |
| POST | `/submit-job` | Submit detection to background queue |
| GET | `/job/{job_id}/status` | Poll job progress |
| GET | `/job/{job_id}/result` | Fetch completed results |
| POST | `/job/{job_id}/cancel` | Cancel running job |
| POST | `/detect-batch` | Batch face detection (single frames) |
| GET | `/health` | Health check |

**Key functions:**

```python
async def verify_api_key(x_api_key: str = Header(None))
    # Auth dependency — checks X-API-Key header, bypassed in DEV_MODE

def upload_video(file: UploadFile)
    # Validates file type, streams chunks to temp dir, extracts fps/resolution

def detect_video_id_endpoint(video_id, sample_rate, ...)
    # Immediate streaming: runs detection in a thread, streams NDJSON progress
    # If queue full: returns 202 with job_id for polling

def export_video(video_id, export_request)
    # Retrieves stored tracks, starts blur pipeline, streams progress
```

**Startup (lifespan):**
1. Validates environment (API_KEY or DEV_MODE)
2. Initializes face detector pool (ONNX sessions)
3. Loads ReID model
4. Initializes Redis queue
5. Starts periodic temp file cleanup

---

### 3.2 Configuration — config.py

Centralized settings, validation helpers, and cleanup routines.

**Constants:**

```python
VIDEO_PROCESSING_CONFIG = {
    "default_padding": 0.4,       # Blur region padding around face
    "default_target_blocks": 8,   # Pixelation granularity
    "max_padding": 2.0,
    "max_target_blocks": 24,
    "min_target_blocks": 4,
}

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}
TEMP_DIR = Path(tempfile.gettempdir()) / "blurthatguy"
CHUNK_SIZE = 2 * 1024 * 1024  # 2MB upload chunks
```

**Key functions:**

```python
def get_safe_video_path(video_id: str, suffix: str) -> Path
    # Returns TEMP_DIR/{uuid}{suffix}, validates UUID format

def validate_video_file(filename, content_type)
    # Checks extension and MIME type against allowed lists

def cleanup_old_files()
    # Deletes temp files older than 1 hour

def validate_environment()
    # Requires API_KEY env or DEV_MODE=true
```

---

### 3.3 Storage — storage.py

Thread-safe in-memory dictionaries for detection results. Data lives only while the server runs.

```python
def store_tracks(video_id: str, tracks: list[dict])
def get_tracks(video_id: str) -> list[dict] | None
def clear_tracks(video_id: str)
def store_job_result(job_id: str, video_id: str, tracks: list[dict])
def get_job_result(job_id: str) -> dict | None
```

All access is protected by a `threading.Lock`.

---

### 3.4 Pipeline: Detector — detector.py

SCRFD-2.5G face detection using ONNX Runtime. Maintains a pool of independent ONNX sessions for concurrent inference.

**Configuration:**

```python
FACE_DETECTION_CONFIG = {
    "score_threshold": 0.55,   # Minimum face confidence
    "nms_threshold": 0.25,     # Non-max suppression overlap
    "max_faces": 5000,
}
DETECTOR_POOL_SIZE = max(2, cpu_count)  # One ONNX session per slot
_SCRFD_SIZE = 640                        # Model input resolution
_onnx_thread_budget = 2                  # Threads per session
```

**Key functions:**

```python
def get_face_detector()
    # Initializes pool of DETECTOR_POOL_SIZE ONNX sessions on CPU

def detect_faces(image: np.ndarray) -> list[dict]
    # Input: BGR image (any size)
    # Process: resize to 640x640 canvas, run SCRFD, decode with NMS
    # Output: [{"bbox": [x,y,w,h], "score": float, "kps": [10 floats]}]

def apply_thread_budget(n_threads: int)
    # Rebuilds ONNX sessions with new thread count (if pool is idle)

def get_thread_pool() -> ThreadPoolExecutor
    # Shared thread pool for parallel frame detection
```

**How detection works:**
1. Input image is resized to fit in a 640x640 canvas (preserving aspect ratio)
2. Pixel values are normalized: `(pixel - 127.5) / 128.0`
3. SCRFD outputs scores, bboxes, and keypoints at 3 scales (stride 8, 16, 32)
4. `_scrfd_decode` maps anchor positions back to original image coordinates
5. OpenCV NMS removes overlapping detections

**`_DetectorLease`** is a context manager that borrows one session from the pool (semaphore-controlled), ensuring sessions are never shared between threads.

---

### 3.5 Pipeline: Processor — processor.py

The orchestrator. Reads frames from video, runs detection, scene cut detection, tracking, and ReID merging.

```python
def process_detection(
    video_id: str,
    video_path: Path,
    sample_rate: int,
    progress_cb=None,
    thread_budget: int | None = None,
    cancel_token: CancellationToken | None = None,
) -> list[dict]
```

**Processing flow (inside process_detection):**

1. **Frame extraction** — Uses ffmpeg with `select=not(mod(n,{sample_rate}))` to decode only every Nth frame. Falls back to OpenCV `VideoCapture` if ffmpeg isn't available.

2. **Scene cut detection** — `check_cut(fi, frame)` compares consecutive frame thumbnails (64x36 grayscale) via Mean Absolute Difference. If MAD > 45.0 and enough frames have passed since the last cut, the frame index is added to `cut_frames`.

3. **Face detection** — Each sampled frame is submitted to the thread pool for `detect_faces()`. Results are drained as they complete (max_pending queue).

4. **Tracking** — `track_detections(detections_per_frame, cut_frames)` links detections into continuous tracks.

5. **ReID merging** — `merge_tracks_by_identity(tracks, video_path)` uses ArcFace to merge track fragments of the same person across scene cuts.

6. **Storage** — Final tracks are stored via `store_tracks(video_id, tracks)`.

**Progress:** 0-80% detection, 80% tracking, 85% ReID, 100% done.

**Other functions:**

```python
def get_encoder() -> str
    # Tests GPU encoders (nvenc, amf, videotoolbox, qsv), falls back to libx264
    # Result cached globally after first call

def apply_job_thread_budget(budget: int | None)
    # Distributes thread budget to detector and reid pools
```

---

### 3.6 Pipeline: Tracker — tracker.py

Links detections across frames into continuous face tracks using IoU-based matching with appearance gating.

**Configuration:**

```python
TRACKER_CONFIG = {
    "iou_threshold": 0.2,          # Minimum IoU for direct match
    "max_misses": 12,              # Frames a track survives without detection
    "min_track_length": 5,         # Minimum frames to keep a track
    "max_center_distance": 1.5,    # Normalized center distance threshold
}
APPEARANCE_THRESHOLD = 0.45        # Cosine similarity for fallback matching
```

**Main function:**

```python
def track_detections(
    detections_per_frame: dict,
    cut_frames: set[int] | None = None
) -> list[dict]
```

**Matching algorithm (per frame):**

1. Build vectorized arrays of active track bboxes
2. Compute IoU, center distance, and size similarity against each new detection
3. **Primary match:** IoU > 0.2 (strongest association)
4. **Fallback match:** If IoU fails, check distance < 1.5 AND similar size AND cosine(embedding) > 0.45
5. **Scene cut guard:** Never match across a scene cut boundary
6. **Gap decay:** Match score decreases with frames since last detection
7. Unmatched detections start new tracks; tracks with max_misses exceeded are finalized

**Output format:**

```python
{
    "id": int,
    "frames": [{"frameIndex": int, "bbox": [x,y,w,h], "score": float, "kps": [...]}],
    "startFrame": int,
    "endFrame": int,
    "thumbnailFrameIndex": int,   # Frame with highest detection score
}
```

**Vectorized helpers** for performance:

```python
def _batch_iou(track_boxes: np.ndarray, det_box) -> np.ndarray
def _batch_center_dist(track_boxes, det_box, img_diag) -> np.ndarray
def _batch_similar_size(track_boxes, det_box) -> np.ndarray
```

**TrackLookup class** — Used during export for smooth blur interpolation:

```python
class TrackLookup:
    def __init__(self, frames: list[dict], max_gap: int = 36)
    def __contains__(self, fi: int) -> bool
    def get(self, fi: int) -> dict | None
    # Binary search + linear bbox interpolation between keyframes
    # Gap-aware: refuses to interpolate across gaps > max_gap (prevents blur bleed across scene cuts)
```

---

### 3.7 Pipeline: ReID — reid.py

Re-identification module. Uses ArcFace embeddings to merge fragmented tracks that belong to the same person (e.g., after scene cuts).

**Configuration:**

```python
REID_POOL_SIZE = max(1, min(4, cpu_count // 2))   # ONNX session pool
REID_THRESHOLD = 0.72          # Cosine similarity threshold for merge
_SAMPLES_PER_TRACK = 15        # Max frames sampled per track
_MAX_TOTAL_SEEKS = 3000        # Total video seek budget across all tracks
_MIN_EMBEDDABLE_SAMPLES = 3    # Minimum good crops needed
_MIN_LAPLACIAN_VAR = 15.0      # Reject blurry crops
_MAX_YAW_RATIO = 2.8           # Reject profile faces
_DRIFT_GATE = 0.45             # Centroid consistency gate
_MIN_TRACK_COHERENCE = 0.5     # Reject scattered tracks
```

**Models:** Prefers `w600k_r50.onnx` (ResNet-50 ArcFace), falls back to `w600k_mbf.onnx` (MobileFaceNet).

**Main function:**

```python
def merge_tracks_by_identity(
    tracks: list[dict],
    video_path: Path,
    cancel_token=None
) -> list[dict]
```

**Merge pipeline:**

1. **Pre-filter** — Separate tracks with enough frames (>= 3) from those too short to embed
2. **Adaptive sampling** — Cap total video seeks at `_MAX_TOTAL_SEEKS`. If many tracks, reduce samples per track
3. **Frame sampling** — Pick frames spread across 5 temporal bins per track
4. **Crop extraction** — Seek video, extract face crops with landmark alignment (5-point warp to 112x112)
5. **Quality filtering** — Reject blurry crops (Laplacian variance < 15) and profile faces (yaw ratio > 2.8)
6. **Embedding** — Run ArcFace with flip augmentation (original + horizontally flipped, averaged)
7. **Drift-aware centroid** — Build per-track centroid incrementally; reject embeddings that drift from the running identity (cosine < 0.45)
8. **Pairwise matching** — Compute cosine similarity matrix of all track centroids
9. **Merge candidates** — Pairs above threshold (0.72) that don't overlap temporally and have similar face sizes
10. **Union-find** — Merge tracks greedily (highest similarity first), checking for temporal conflicts

**Key helper functions:**

```python
def _align_face(frame, kps) -> np.ndarray | None
    # 5-point landmark alignment to ArcFace template (112x112)

def _extract_face_crop(frame, det) -> np.ndarray | None
    # Tries landmark alignment, falls back to padded bbox crop

def _embed_crops(crops: list[np.ndarray]) -> np.ndarray
    # Batch embedding with flip augmentation, returns (N, 512) L2-normalized

def _build_centroid(embeddings: np.ndarray) -> tuple[np.ndarray | None, float]
    # Drift-aware incremental centroid with consistency gate
    # Returns (centroid_vector, coherence_score)

def embed_detections(frame, detections) -> list[dict]
    # Inline embedding during detection (for tracker appearance gating)
```

---

### 3.8 Pipeline: Blur — blur.py

Applies pixelation or blackout blur with an elliptical mask. Called per-frame during export.

```python
def _blur_frame(args: tuple) -> tuple[int, np.ndarray]
    # args = (frame_index, frame, track_lookups, padding, target_blocks, width, height, blur_mode)
```

**Process for each detected face on the frame:**

1. Look up bbox from track lookup (includes interpolated frames)
2. Expand bbox by `padding` factor (default 0.4)
3. Create elliptical mask over the region
4. If `pixelate`: downsample to block grid, upsample with nearest-neighbor
5. If `blackout`: fill with zeros
6. Blend blurred region back using the ellipse mask

**Adaptive block size:** `block_size = max(6, min(w, h) // target_blocks)` — same visual density regardless of face size.

---

### 3.9 Jobs: Queue Manager — queue_manager.py

Redis-based job admission control. Limits concurrent processing to `MAX_ACTIVE_JOBS = 2` and distributes CPU threads fairly.

**Redis key structure:**

```
btg:active              — Set of active job IDs
btg:waiting             — List of queued job IDs (FIFO)
btg:admission_lock      — Distributed lock
btg:job:{id}:status     — queued | running | done | error | cancelled
btg:job:{id}:thread_budget — Allocated threads for this job
btg:job:{id}:progress   — 0.0 to 100.0
btg:job:{id}:hb         — Heartbeat timestamp (60s TTL)
```

**Key functions:**

```python
def try_admit(r, job_id) -> str
    # Returns "running" (admitted) or "queued" (wait your turn)

def wait_until_admitted(r, job_id, timeout=300) -> bool
    # Polls Redis every 1s until status changes to "running"

def on_job_finish(r, job_id)
    # Removes from active set, promotes next waiting job, rebalances threads

def rebalance(r)
    # per_job_budget = TOTAL_THREAD_BUDGET // len(active_jobs)
    # Distributes evenly across all active jobs

def evict_stale_jobs(r)
    # Removes jobs whose heartbeat expired (>60s without update)
```

**Thread budgeting example:** 16-core machine, 2 active jobs = 8 threads each. If one finishes, the remaining job gets all 16.

---

### 3.10 Jobs: Job Runner — job_runner.py

Executes queued detection jobs in background threads with heartbeat monitoring.

```python
class CancellationToken:
    cancelled: bool = False
    def cancel(self)  # Thread-safe cancellation flag

def run_queued_detection_job(r, job_id, video_id, video_path, sample_rate, ...)
    # 1. Wait for admission from queue
    # 2. Apply thread budget
    # 3. Start heartbeat thread (pings Redis every 15s)
    # 4. Run process_detection() with progress callbacks
    # 5. Store results
    # 6. Handle cancellation (InterruptedError)
    # 7. Cleanup: stop heartbeat, remove cancel token, finish job
```

---

### 3.11 Jobs: Stream Generators — stream_generators.py

Produces NDJSON event streams for real-time progress communication.

**Detection stream:**

```python
def detect_stream_generator(r, job_id, video_id, video_path, sample_rate, ...)
    # Runs detection in a daemon thread
    # Yields: {"type": "progress", "progress": 45.5}
    # Yields: {"type": "results", "results": [...]}
    # Keepalive: empty string every 5s if idle
    # On client disconnect: cancels via stream_token
```

**Export stream:**

```python
def export_stream_generator(video_id, export_request, tracks, input_path, output_path, ...)
    # 1. Filter tracks by selectedTrackIds
    # 2. Build TrackLookup objects (gap-aware interpolation)
    # 3. Spawn ffmpeg decoder (reads all frames) and encoder (writes output)
    # 4. Read frames via background thread into bounded queue
    # 5. For each frame:
    #    - If no blur needed: write directly to encoder
    #    - If blur needed: add to chunk, flush when chunk full
    # 6. flush_chunk submits blur jobs to thread pool, writes results in order
    # 7. Yields progress as NDJSON throughout
    # 8. Final: {"type": "done"} or {"type": "error", "error": "..."}
```

**NDJSON protocol:**

```json
{"type": "progress", "progress": 25.0}
{"type": "results", "results": [{"id": 1, "frames": [...], ...}]}
{"type": "done"}
{"type": "error", "error": "Export failed"}
```

---

## 4. Frontend

### 4.1 Layout & Landing Page

**`app/layout.tsx`** — Root layout with Inter font, dark theme, and global styles.

**`app/(landing)/page.tsx`** — Marketing landing page with:
- Hero section with CTA buttons ("Start Blurring", "See How It Works")
- Feature cards explaining the 3-step process
- Benefits grid (Privacy, Speed, Selective)
- Animated MockUI showing a fake processing interface
- Scroll-synced URL hash (`#how-it-works`)

**Landing components:**
- `Navbar` — Top bar with logo and UserDropdown (or portfolio link if user integration is off)
- `FeatureCard` — Step card with glowing border on hover
- `MockUI` — Animated demo UI with fake face gallery and toolbar
- `Footer` — Logo and creator attribution

---

### 4.2 Upload Page — The Main Workflow

**`app/upload/page.tsx`** — Three-step processing flow:

**Step 1: Upload**
- `DropZone` component for drag-and-drop
- File uploaded to backend via `/api/upload-video`
- Video metadata displayed (filename, size, duration)

**Step 2: Detect**
- Sample rate slider (1-10)
- Starts detection via `useFaceDetection` hook
- Shows progress bar with contextual status messages
- If queued: shows queue position with polling
- Cancel button stops detection

**Step 3: Select**
- Stats toolbar: detected / blurred / visible face counts
- `PlayerWithMask` — Video player with real-time canvas blur overlay
- `FaceGallery` — Clickable face thumbnails to toggle blur
- `BlurModeToggle` — Switch between pixelate and blackout
- **Download button** — Exports and downloads blurred video
- **Save button** — Exports, uploads to S3, saves metadata (requires login)

---

### 4.3 Upload Hooks

**`useVideoUpload`** — Manages file upload state.

```typescript
handleFile(file: File)
    // Validates file, creates object URL, uploads to /api/upload-video
    // Sets: fileUrl, fileName, videoId, videoMetadata

reset()
    // Clears all state, revokes object URL
```

**`useFaceDetection`** — Manages the detection workflow.

```typescript
runDetection()
    // 1. loadModels() — health check
    // 2. detectFacesInVideo() — streams NDJSON from backend
    // 3. If queued (202): polls job status every 1-2s
    // 4. On complete: sets tracks, auto-selects all
    // Progress ratcheting: never regresses

toggleTrack(trackId: number)    // Add/remove from selection
selectAll() / deselectAll()     // Bulk operations
```

**`useVideoExport`** — Manages download and save workflows.

```typescript
exportVideo()
    // runExport() → browser download via <a> tag

saveVideo()
    // runExport() (0-60%)
    // → fetch blob (60-70%)
    // → get presigned S3 URL (70%)
    // → upload to S3 (70-90%)
    // → save metadata to Supabase (90-100%)
```

---

### 4.4 Upload Components

**`DropZone`** — Drag-and-drop file upload area with supported format hints.

**`ProgressBar`** — Animated gradient bar with percentage and status text.

**`ErrorAlert`** — Dismissible error message (wraps `Alert` component).

**`FaceGallery`** — Scrollable grid of detected faces.
- Extracts thumbnails by seeking video to each track's middle frame
- Crops face from canvas with 30% padding, renders at 96x96
- Click to toggle blur, Select All / Clear All buttons
- Shows merge badge if track was merged from multiple fragments

**`PlayerWithMask`** — Canvas-based video player with real-time blur overlay.
- Synchronizes canvas drawing with video playback via `requestAnimationFrame`
- `findDetectionForFrame()` — Binary search with interpolation for smooth tracking
- Draws elliptical blur (pixelate or blackout) on selected tracks
- Red ellipse outline on all detected faces
- Click a face in the video to toggle its blur selection

**`BlurModeToggle`** — Animated toggle between pixelate and blackout modes.

**`Bentobox`** — Simple card wrapper component.

---

### 4.5 Shared Components

**`Header`** — Step indicator bar showing Upload → Detect → Select with animated progress.

**`UserDropdown`** — Auth menu. Only renders if `NEXT_PUBLIC_USER_INTEGRATION === '1'`. Shows login button for guests, profile menu for authenticated users (My Videos, Settings, Sign out).

**`Logo`** — Brand component with EyeOff icon, two sizes (sm, md).

**`Alert`** — Dismissible alert with variants: error (red), success (green), info (blue).

**`BackgroundBlobs`** — Animated gradient background blobs (fixed, decorative).

---

### 4.6 Auth Pages — Login, Signup, Settings

**`app/login/page.tsx`** — Email/password login via Supabase. Redirects to home on success.

**`app/signup/page.tsx`** — Registration with username, email, password (6+ chars). Shows "check your email" on success.

**`app/settings/page.tsx`** — Account management:
- View email
- Change password
- Delete account (danger zone, uses admin Supabase client)

All auth pages redirect to `/login` if not authenticated (except login/signup themselves).

---

### 4.7 My Videos Page

**`app/my-videos/page.tsx`** — Library of saved blurred videos.
- Fetches from `/api/videos` (which queries Supabase + generates S3 signed URLs)
- Grid of video cards showing filename, date, file size
- Download button (direct S3 signed URL)
- Delete button with confirmation
- Redirects to login if not authenticated

---

## 5. Lib

### 5.1 Face Client — faceClient.ts

The main communication layer between frontend hooks and the backend API.

```typescript
loadModels()
    // GET /api/health — checks backend is ready

detectFacesInVideo(videoId, sampleRate, onProgress?, signal?, onJobId?)
    // POST /api/detect-video/{videoId}?sample_rate=X
    // Streams NDJSON, returns { tracks, queued, jobId }
    // If 202: returns queued=true with jobId for polling

getJobStatus(jobId, signal?)
    // GET /api/job/{jobId}/status
    // Returns { status, position, thread_budget, progress }

getJobResult(jobId, signal?)
    // GET /api/job/{jobId}/result — returns Track[]

cancelJob(jobId)
    // POST /api/job/{jobId}/cancel (fire-and-forget via sendBeacon)
```

---

### 5.2 Backend Proxy — backendProxy.ts

Server-side helper used by all API routes to forward requests to the Python backend.

```typescript
const BACKEND_URL = process.env.API_URL || 'http://localhost:8000'
const API_KEY = process.env.API_KEY || ''

backendHeaders(extra?: HeadersInit)
    // Returns headers with X-API-Key injected
```

---

### 5.3 Supabase Clients

Three clients for different contexts:

| File | Context | Key |
|------|---------|-----|
| `lib/supabase/client.ts` | Browser | Public anon key |
| `lib/supabase/server.ts` | Next.js API routes | Public anon key + cookies |
| `lib/supabase/admin.ts` | Admin operations | Service role key |

---

### 5.4 Utilities

**`lib/utils/format.ts`:**

```typescript
formatFileSize(bytes: number) -> string    // "1.5 GB", "340 MB", "12 KB"
formatDuration(seconds: number) -> string  // "2:35"
formatDate(iso: string) -> string          // "25 Mar 2026"
```

---

### 5.5 Types

```typescript
type BBox = [number, number, number, number]  // [x, y, width, height]

interface Detection {
    frameIndex: number
    bbox: BBox
    score: number
}

interface Track {
    id: number
    frames: Detection[]
    startFrame: number
    endFrame: number
    thumbnailFrameIndex: number
    mergedFrom?: number[]
}

type BlurMode = 'pixelate' | 'blackout'

interface VideoRecord {
    id: string
    filename: string
    s3_key: string
    file_size: number
    created_at: string
    signedUrl?: string
}
```

---

## 6. API Routes

All Next.js API routes act as a proxy between the frontend and the Python backend. This keeps the backend URL and API key hidden from the browser.

### 6.1 Backend Proxy Routes

| Route | Method | Backend Target | Notes |
|-------|--------|---------------|-------|
| `/api/health` | GET | `/health` | Health check |
| `/api/upload-video` | POST | `/upload-video` | FormData pass-through |
| `/api/detect-video/[videoId]` | POST | `/detect-video/{videoId}` | NDJSON stream, 30min timeout |
| `/api/export/[videoId]` | POST | `/export/{videoId}` | NDJSON stream, 30min timeout |
| `/api/download/[videoId]` | GET | `/download/{videoId}` | Video file stream |
| `/api/job/[jobId]/status` | GET | `/job/{jobId}/status` | Job polling |
| `/api/job/[jobId]/result` | GET | `/job/{jobId}/result` | Detection results |
| `/api/job/[jobId]/cancel` | POST | `/job/{jobId}/cancel` | Cancel job |

### 6.2 User Video Routes (Auth Required)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/videos` | GET | List user's saved videos (Supabase + S3 signed URLs) |
| `/api/videos/presign` | POST | Get S3 upload URL (quotas: 2GB/file, 5GB/user, 30GB/bucket, 10/hour) |
| `/api/videos/save` | POST | Save video metadata to Supabase |
| `/api/videos/delete` | DELETE | Delete from S3 + Supabase (ownership verified) |

### 6.3 User Account Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/user/delete` | DELETE | Delete user account (admin client) |

---

## 7. Data Flow — End to End

### Upload

```
Browser                    Next.js API              Python Backend
  |                           |                          |
  |-- POST /api/upload-video ->                          |
  |                           |-- POST /upload-video ---->
  |                           |                          | validate file
  |                           |                          | stream to temp dir
  |                           |                          | extract metadata
  |                           |<-- {videoId, metadata} --|
  |<-- {videoId, metadata} ---|                          |
```

### Detection

```
Browser                    Next.js API              Python Backend
  |                           |                          |
  |-- POST /api/detect-video ->                          |
  |                           |-- POST /detect-video ---->
  |                           |                          | ffmpeg decode frames
  |                           |                          | SCRFD face detection
  |                           |                          | scene cut detection
  |<--- NDJSON progress ------|<--- NDJSON progress -----|
  |                           |                          | track_detections()
  |                           |                          | merge_tracks_by_identity()
  |<--- NDJSON results -------|<--- NDJSON results ------|
  |                           |                          | store_tracks()
  | set tracks in state       |                          |
```

### Export & Download

```
Browser                    Next.js API              Python Backend
  |                           |                          |
  |-- POST /api/export ------>                           |
  |                           |-- POST /export --------->|
  |                           |                          | load stored tracks
  |                           |                          | build TrackLookup objects
  |                           |                          | ffmpeg decode ALL frames
  |                           |                          | blur selected faces
  |                           |                          | ffmpeg encode output
  |<--- NDJSON progress ------|<--- NDJSON progress -----|
  |<--- {"type": "done"} -----|                          |
  |                           |                          |
  |-- GET /api/download ----->|                          |
  |                           |-- GET /download -------->|
  |<--- video/mp4 stream -----|<--- video/mp4 stream ----|
  | browser download dialog   |                          |
```

### Save to Cloud (Optional)

```
Browser                    Next.js API              AWS S3 / Supabase
  |                           |                          |
  | (after export completes)  |                          |
  |-- GET /api/download ----->|                          |
  |<--- blob ------------------|                          |
  |                           |                          |
  |-- POST /api/videos/presign ->                        |
  |                           | auth check               |
  |                           | quota check              |
  |<--- {uploadUrl, key} -----|                          |
  |                           |                          |
  |-- PUT uploadUrl (blob) ---|------------------------->|
  |<--- 200 OK ---------------|<-------------------------|
  |                           |                          |
  |-- POST /api/videos/save ->|                          |
  |                           |-- INSERT into Supabase ->|
  |<--- {success: true} ------|                          |
```

---

## 8. Deployment

### Docker Compose

Three services:

```yaml
frontend:     # Next.js (port 3000)
backend:      # FastAPI + Uvicorn (port 8000)
redis:        # Redis 7 Alpine (port 6379, memory-only)
```

### Environment Variables

**Required:**

| Variable | Where | Purpose |
|----------|-------|---------|
| `API_KEY` | Backend | API authentication (or set `DEV_MODE=true`) |

**Optional — Backend:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEV_MODE` | false | Disables API_KEY requirement |
| `ALLOWED_ORIGINS` | localhost:3000 | CORS allowed origins (comma-separated) |
| `REDIS_URL` | redis://localhost:6379 | Redis connection string |
| `MAX_UPLOAD_SIZE_MB` | 0 (unlimited) | Upload file size limit |
| `DETECTOR_POOL_SIZE` | cpu_count | Number of ONNX detector sessions |
| `ONNX_THREAD_BUDGET` | 2 | Threads per ONNX session |
| `TOTAL_THREAD_BUDGET` | cpu_count | Total threads for all active jobs |
| `REID_MAX_SEEKS` | 3000 | Max video seeks during ReID |

**Optional — Frontend:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_USER_INTEGRATION` | 0 | Enable auth/save features (set to `1`) |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase admin key (for account deletion) |
| `AWS_ACCESS_KEY_ID` | — | S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | — | S3 credentials |
| `AWS_REGION` | — | S3 region |
| `AWS_S3_BUCKET_NAME` | — | S3 bucket for saved videos |
