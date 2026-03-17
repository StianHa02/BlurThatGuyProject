# BlurThatGuy

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

> A coding challenge submission for FONN Group and Mimir.
---


## Preface

As part of this coding challenge, I wanted to specialize in **frontend** and **infrastructure** using React/Next.js and deploying AWS EC2.

The application was initially developed with a backend hosted on EC2 and a frontend deployed on Vercel. However, due to payload size limitations, I chose to deploy both the frontend and backend on AWS EC2.

The backend was implemented with FastAPI to align with the original architecture and ensure efficient, scalable API development.

---

## Learning Outcomes
- Familiarized with FastAPI
- Familiarized with AWS and deployment options
- Tied together frontend and backend through APIs

---

## Table of Contents
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [How to Use](#how-to-use)
- [Backend Features](#backend-features)
- [Tech Stack](#tech-stack)
- [Deployment](#deployment)
- [Architecture Diagram](#architecture-diagram)
- [Project Structure](#project-structure)
- [Docker Tips](#docker-tips)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Option 1: Live Demo

**Requirements:** Web browser (contact me to start the EC2 instance)

[https://blurthatguy.no/](https://blurthatguy.no/)

---

### Option 2: Run with Docker

**Requirements:** Docker Desktop

```bash
# Clone the repository
git clone https://github.com/StianHa02/BlurThatGuyProject.git
cd BlurThatGuyProject
```

> **Recommended:** For better ReID accuracy, download the full `w600k_r50.onnx` model from HuggingFace and place it in `backend/models/`:
> [https://huggingface.co/maze/faceX/blob/main/w600k_r50.onnx](https://huggingface.co/maze/faceX/blob/main/w600k_r50.onnx)

```bash
# Start everything
docker compose up --build

# Stop
docker compose down
```

**For Development (hot reload):**
```bash
docker compose -f docker-compose.dev.yml up --build

# In a second terminal
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

### Option 3: Run Locally

**Requirements:** Node.js 20+, Python 3.11+, pnpm (`npm install -g pnpm`)

**Terminal 1 — Backend (macOS/Linux):**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 1 — Backend (PowerShell):**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

> **Note:** Local development runs in `DEV_MODE`, which disables API key authentication.

---

## Environment Configuration

### Local Development

**Frontend** (`.env.local` in project root):
```bash
API_URL=http://localhost:8000
API_KEY=
```

**Backend** (`backend/.env.local`):
```bash
DEV_MODE=true
ALLOWED_ORIGINS=http://localhost:3000
REDIS_URL=redis://localhost:6379

# Optional: limit upload size in MB. Omit for no limit.
# MAX_UPLOAD_SIZE_MB=500

# Optional: override ONNX thread budget. Omit to auto-detect from cpu_count().
# TOTAL_THREAD_BUDGET=28
```

### Production Deployment

**Frontend** (`.env.prod`):
```bash
API_URL=http://backend:8000
API_KEY=your-secure-random-api-key-here
BACKEND_URL=http://backend:8000
```

**Backend** (`.env.prod`):
```bash
API_KEY=same-api-key-as-frontend
ALLOWED_ORIGINS=https://your-domain.com
REDIS_URL=redis://redis:6379

# Optional: limit upload size in MB. Omit for no limit.
# MAX_UPLOAD_SIZE_MB=500

# Optional: set explicitly on high-core-count servers for best performance.
# TOTAL_THREAD_BUDGET=28
```

---

## How to Use

1. **Upload Video** — drag & drop or click to upload. Supported: MP4, WebM, MOV.

2. **Detect Faces** — click Start Detection. The AI scans through your video, detects all faces, tracks them across frames, and re-identifies the same person across scene cuts. A 15-minute video at the default sample rate takes roughly 2 minutes to process.

3. **Select Faces to Blur** — play the video and click faces with red frames, or select from the face gallery. Selected faces appear pixelated in real time.

4. **Download** — click Download Video. The processed file is encoded with selected faces permanently blurred.

---

## Backend Features

### Face Detection
Uses **SCRFD-2.5G** (`scrfd_2.5g.onnx`) — a lightweight ONNX model optimised for CPU. Runs inference on sampled frames at a configurable rate (default: every 3rd frame). Detects bounding boxes and 5-point facial landmarks per crop. Frames are decoded via ffmpeg for speed, with an OpenCV fallback.

### Face Tracking
Builds continuous face tracks across frames using IoU-based assignment. Detects scene cuts via mean absolute difference on downscaled thumbnails and resets track state at hard transitions, preventing identity bleed. Handles occlusion and brief disappearances.

### Re-Identification (ReID)
Uses **ArcFace** (`w600k_r50.onnx` preferred, `w600k_mbf.onnx` as fallback) to generate 512-dimensional L2-normalised identity vectors per face crop. Merges fragmented tracks across scene cuts by cosine similarity with a union-find algorithm. Includes quality gates: blur rejection (Laplacian variance), profile angle rejection (landmark geometry), and an incremental drift-aware centroid that rejects embeddings inconsistent with the track's running identity.

### Job Queue
Built on **Redis** with a 2-concurrent-job limit. A third user uploading while two jobs are running is placed in a FIFO waiting queue and shown their position in the UI. When a slot frees — either naturally on completion or immediately on cancel — the next waiter is promoted and begins processing. Thread budget is split evenly across active jobs so two concurrent users each get half the available CPU rather than competing.

Cancellation is **cooperative**: when a user navigates away, reloads, or clicks Upload New, the frontend fires a cancel request via `POST /job/{jobId}/cancel`. The backend sets a cancellation flag that the running job checks at each frame loop iteration, before tracking, and before ReID — stopping within milliseconds at the next natural checkpoint rather than running to completion.

### Export & Blur Rendering
Pixelation (or blackout) applied exclusively to selected track IDs. Rendered via ffmpeg with hardware encoder detection (nvenc → amf → videotoolbox → qsv → libx264 fallback). Export progress streamed back to the client as NDJSON.

### API & Streaming
Built with **FastAPI + Uvicorn**. Detection results stream as NDJSON for real-time progress. All endpoints are proxied through Next.js route handlers in `app/api/*`. Relevant endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/upload-video` | POST | Upload a video file |
| `/detect-video/{videoId}` | POST | Start detection (streams NDJSON or returns 202 if queued) |
| `/job/{jobId}/status` | GET | Poll job status, position, and progress |
| `/job/{jobId}/result` | GET | Fetch completed detection results |
| `/job/{jobId}/cancel` | POST | Cancel a queued or running job |
| `/export/{videoId}` | POST | Render blurred video (streams NDJSON progress) |
| `/download/{videoId}` | GET | Download the blurred output file |

---

## Tech Stack

**Frontend:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Framer Motion, Lucide React

**Backend:** Python 3.11, FastAPI, Uvicorn, OpenCV, NumPy, ONNX Runtime, Redis (via redis-py)

**ML Models:**
- Face detection: `scrfd_2.5g.onnx` (SCRFD-2.5G)
- Face re-identification: `w600k_r50.onnx` (ArcFace ResNet-50, preferred) / `w600k_mbf.onnx` (MobileFaceNet, fallback)

**Infra:** Docker + Docker Compose, AWS EC2 (c7i — Intel Sapphire Rapids with AVX-512), nginx (reverse proxy), GitHub Actions (CI/CD)

---

 
## Deployment
 
The production deployment runs on two AWS EC2 instances behind an **Application Load Balancer (ALB)**:
 
| Node | Instance | Role |
|------|----------|------|
| Primary | `c7i.8xlarge` — 32 vCPU, Intel Sapphire Rapids | Handles all traffic by default |
| Secondary | `c7i-flex.large` — 2 vCPU | Overflow when primary is busy |
 
**Traffic routing** uses ALB's Least Outstanding Requests algorithm — new requests go to whichever node has fewer active jobs. With a 32-core primary and a 2-core secondary, the primary naturally absorbs the vast majority of traffic due to faster job completion.
 
**TLS** is terminated at the ALB using an AWS Certificate Manager cert that auto-renews. Each EC2 runs nginx as a reverse proxy to the Docker containers on port 80.
 
**Infrastructure:**
- ALB → nginx (port 80) → Next.js frontend (port 3000) + FastAPI backend (port 8000)
- Redis runs as a sidecar container on each node for job queue state
- EC2 security groups restrict port 80 to ALB only — direct IP access is blocked
 
---

## Architecture Diagram
![img.png](public/Architecture_diagram.png)

## Project Structure


---

```
BlurThatGuyProject/
├── app/
│   ├── favicon.ico                  # App favicon
│   ├── globals.css                  # Global styles
│   ├── layout.tsx                   # Root layout
│   ├── page.tsx                     # Root page (routed to landing/page)
│   ├── (landing)/                    # Landing Page 
│   ├── api/                          # Next.js API routes that proxy to FastAPI
│   │   ├── detect-video/[videoId]/route.ts
│   │   ├── export/[videoId]/route.ts
│   │   ├── upload-video/route.ts
│   │   ├── download/[videoId]/route.ts
│   │   └── job/[jobId]/
│   │       ├── status/route.ts
│   │       ├── result/route.ts
│   │       └── cancel/route.ts
│   └── upload/
│       ├── components/               # Upload page UI 
│       ├── hooks/                    # Upload flow hooks 
│       └── page.tsx                  # Main upload workflow page
├── lib/                              
│   ├── faceClient.ts                 # Frontend client for backend API calls
│   ├── tracker.ts                    # Shared face-track helpers/types for UI state
│   └── server/backendProxy.ts        # Server-side proxy utilities (API key forwarding)
├── backend/
│   ├── main.py                       # FastAPI app + all API endpoints
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── detector.py               # SCRFD detection pipeline + session pool
│   │   ├── tracker.py                # IoU-based track building
│   │   ├── reid.py                   # ArcFace ReID + identity merge
│   │   ├── blur.py                   # Pixelation/blackout rendering
│   │   └── processor.py              # Detection pipeline + encoder selection
│   ├── jobs/
│   │   ├── __init__.py
│   │   ├── job_runner.py             # Queued detection execution helpers
│   │   ├── queue_manager.py          # Redis queue state + admission
│   │   └── stream_generators.py      # NDJSON streaming for detect/export
│   ├── storage.py                    # In-memory tracks and job-result store
│   ├── config.py                     # Env, validation, temp file helpers
│   ├── auth.py
│   ├── requirements.txt
│   └── models/                       # ONNX models 
├── docker-compose.yml                # Dockwer Compose for production deployment
├── docker-compose.dev.yml            # Docker Compose for local development with hot reload
├── Dockerfile.backend
├── Dockerfile.frontend
└── README.md
```

---

## Docker Tips

```bash
# View logs
docker compose logs -f
docker compose logs -f backend

# Rebuild after changes
docker compose down && docker compose up --build

# Clean rebuild
docker compose down
docker system prune -a
docker compose up --build

# Check running containers
docker compose ps
```

---

## Troubleshooting

**No faces detected**
- Ensure faces are clearly visible and reasonably frontal
- Lower the sample rate slider (lower = more thorough)

**Detection is slow**
- Increase the sample rate (higher = faster, less thorough)
- Check that the backend container has access to all CPU cores

**Containers won't start**
```bash
docker compose down
docker system prune -a
docker compose up --build
```

**Port already in use (macOS/Linux)**
```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

**Port already in use (PowerShell)**
```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## License

[MIT](LICENSE) — Made by [stianha.com](https://stianha.com)