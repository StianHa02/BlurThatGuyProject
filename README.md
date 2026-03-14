# BlurThatGuy (Coding challenge by FONN Group and Mimir)

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

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
- [How the Backend Works](#how-the-backend-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Docker Tips](#docker-tips)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Quick Start


### Option 1: Run on Your Browser

**Requirements:**
- Web browser
- (Contact me to start the EC2 instance)

**Live Demo:**
[https://blurthatguy.no/](https://blurthatguy.no/)

---

### (Run localy) Clone the repository

```powershell
git clone https://github.com/StianHa02/BlurThatGuyProject.git
cd BlurThatGuyProject
```

### Option 2: Run with Docker

**Requirements:**
- Docker Desktop

> Use `docker compose` (recommended). If your setup still uses `docker-compose`, the same commands apply with the hyphenated form.

**For Regular Use:**
```bash
# Start everything
docker compose up --build

# Stop
docker compose down
```

**For Development (with hot reload):**
```bash
# Start with hot reload enabled
docker compose -f docker-compose.dev.yml up --build

# on another terminal
pnpm run dev

# Code changes automatically reload!
```

Open [http://localhost:3000](http://localhost:3000)

---

### Option 3: Run Locally

**Requirements:**
- Node.js 20+
- Python 3.11+
- pnpm (install with `npm install -g pnpm`)
- Environment variables configured (see section below)

**Terminal 1 - Start Backend (PowerShell):**
```powershell
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 1 - Start Backend (macOS/Linux):**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Start Frontend:**

```bash
# Install and run
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) ✨

> **Note**: Local development runs in `DEV_MODE`, which disables API key requirements. The frontend `.env.local` points to `http://localhost:8000` for the backend connection.

---

## Environment Configuration

### Local Development (No API Key Required)

For local development, the app runs in **DEV_MODE** which disables API key authentication:

**Frontend** (`.env.local` in project root):
```bash
# Backend API URL for Next.js API routes
API_URL=http://localhost:8000

# No API key needed for local dev
API_KEY=
```

**Backend** (`backend/.env.local`):
```bash
# Enable dev mode (disables API key requirement)
DEV_MODE=true

# Allowed origins
ALLOWED_ORIGINS=http://localhost:3000

# Max upload size
MAX_UPLOAD_SIZE_MB=100
```

### Production Deployment (API Key Required)

For production (EC2) or using just backend as a standalone API:

*Make sure to remove environment in docker file and point to your own .env file*

**Frontend** (`.env.prod`):
```bash
API_URL=http://backend:8000
API_KEY=your-secure-random-api-key-here
BACKEND_URL=http://backend:8000
```

**Backend** (`.env.prod` or environment file):
```bash
API_KEY=same-api-key-as-frontend
ALLOWED_ORIGINS=https://your-domain.com
MAX_UPLOAD_SIZE_MB=100
```
---



## How to Use

1. **Upload Video**
   - Click "Upload" or drag & drop your video file
   - Supported formats: MP4, WebM, MOV
   - Max size: 100MB

2. **Detect Faces**
   - Click "Start Detection"
   - AI will scan through your video and find all faces
   - Processing time: ~60 seconds for a 2-minute video

3. **Select Faces to Blur**
   - Play the video
   - Click on faces with red frames to blur them
   - Or select faces in the face gallery
   - Selected faces appear pixelated
   - Click blurred faces to unblur

4. **Download**
   - Click "Download Video"
   - Your processed video will download with selected faces permanently blurred

---

## How the Backend Works

The backend is a FastAPI service that processes videos in four main steps:

1. **Upload (`/upload-video`)**
   - Validates file type and size
   - Stores the video in a temporary folder and returns `videoId` + metadata

2. **Detect + Track (`/detect-video/{video_id}`)**
   - Samples frames and runs SCRFD face detection (`scrfd_2.5g.onnx`)
   - Tracks faces across frames and handles scene cuts
   - Merges identity fragments using ArcFace ReID (`w600k_r50.onnx`, fallback `w600k_mbf.onnx`)
   - Streams progress/results back as NDJSON

3. **Export (`/export/{video_id}`)**
   - Applies blur only to selected track IDs
   - Renders output with ffmpeg (or OpenCV fallback)

4. **Download (`/download/{video_id}`)**
   - Returns the final blurred MP4

The frontend calls these through Next.js route handlers in `app/api/*`, which proxy requests to the FastAPI backend and inject headers from `lib/server/backendProxy.ts`.

---

## Tech Stack

**Frontend:**
- Next.js 16 (App Router + Route Handlers)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Framer Motion + Lucide React

**Backend:**
- Python 3.11
- FastAPI + Uvicorn
- OpenCV + NumPy
- ONNX Runtime
- Models:
  - Face detection: `backend/models/scrfd_2.5g.onnx`
  - Face re-identification: `backend/models/w600k_r50.onnx` (preferred) and `backend/models/w600k_mbf.onnx` (fallback)

**Deployment / Infra:**
- Docker + Docker Compose (Containerization)
- AWS EC2 (VPS)
- Nginx (reverse proxy)
- Github Actions (CI/CD)

---


## Project Structure

```
BlurThatGuyProject/
|-- app/
|   |-- (landing)/                # Landing page and UI components
|   |   |-- components/
|   |   `-- page.tsx
|   |-- api/                      # Next.js route handlers (proxy to backend)
|   |   |-- detect-video/[videoId]/route.ts
|   |   |-- download/[videoId]/route.ts
|   |   |-- export/[videoId]/route.ts
|   |   |-- health/route.ts
|   |   `-- upload-video/route.ts
|   |-- upload/
|   |   |-- components/           # Upload page UI components
|   |   |-- hooks/                # Upload, detect, export hooks
|   |   `-- page.tsx
|   |-- globals.css
|   |-- layout.tsx
|   `-- page.tsx
|-- backend/
|   |-- main.py                   # FastAPI app and endpoints
|   |-- detector.py               # SCRFD detection pipeline
|   |-- tracker.py                # Track building across frames
|   |-- reid.py                   # ArcFace-based identity merge
|   |-- blur.py                   # Blur/blackout rendering helpers
|   |-- requirements.txt
|   `-- models/
|       |-- scrfd_2.5g.onnx
|       |-- w600k_mbf.onnx
|       `-- w600k_r50.onnx
|-- lib/
|   |-- config.ts
|   |-- faceClient.ts
|   |-- tracker.ts
|   `-- server/
|       `-- backendProxy.ts       # Shared backend URL/API-key headers
|-- public/
|   |-- Test video/               # Sample videos
|   `-- favicon.ico
|-- docker-compose.yml
|-- docker-compose.dev.yml
|-- Dockerfile.backend
|-- Dockerfile.frontend
|-- Dockerfile.frontend.dev
|-- README.md
```

---

## Docker Tips

**View logs:**
```bash
# All services
docker compose logs -f

# Just frontend
docker compose logs -f frontend

# Just backend
docker compose logs -f backend
```

**Rebuild after code changes (production):**
```bash
docker compose down
docker compose up --build
```

**Clean rebuild (if something breaks):**
```bash
docker compose down
docker system prune -a  # Warning: removes all unused Docker data
docker compose up --build
```

**Check what's running:**
```bash
docker compose ps
```

---

## Troubleshooting

**Video won't upload (413 error)**
- Make sure your video is under 100MB
- Try a shorter video or compress it first

**No faces detected**
- Ensure faces are clearly visible in the video
- Try adjusting the sample rate slider (lower = more accurate)
- Use a video with frontal face views

**Containers won't start**
```bash
docker compose down
docker system prune -a
docker compose up --build
```

**Port already in use (PowerShell)**
```powershell
# Frontend (port 3000)
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Backend (port 8000)
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Port already in use (macOS/Linux)**
```bash
# Frontend (port 3000)
lsof -ti:3000 | xargs kill -9

# Backend (port 8000)
lsof -ti:8000 | xargs kill -9
```

---



## License

[MIT](LICENSE)

---

Made by [stianha.com](https://stianha.com)
