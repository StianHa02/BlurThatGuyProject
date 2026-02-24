# BlurThatGuy (Coding challenge by FONN Group and Mimir)

TODO:
Nice to have
A demo video in the README — a 30 second GIF or screen recording. Employers often won't run it locally so show it working.
Remove the excessive console.logs in useVideoExport.ts — there are about 10 debug logs in there from when you were fixing the stale closure bug. Clean those up before showing anyone the code.
Make blurring in backed consistant with in frontend

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

---

## Preface

As part of this competition, I wanted to specialize in building **frontend** using React/Next.js and deploying the **infrastructure** on AWS EC2 with Docker.

The application was initially developed with a backend hosted on EC2 and a frontend deployed on Vercel. However, due to payload size limitations, I chose to deploy both the frontend and backend on AWS EC2.

The backend was implemented with FastAPI to align with the original architecture and ensure efficient, scalable API development.

---

## Leardning Outcomes
- Deployed a Next.js frontend on AWS EC2 with Docker
- Deployed a FastAPI backend on AWS EC2 with Docker
- Used OpenCV to detect faces in videos

---

## Table of Contents
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [How to Use](#how-to-use)
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


### Option 2: Run with Docker

**Requirements:**
- Docker Desktop
- Setup Environment Variable (look av setup section under)

**For Regular Use:**
```bash
# Start everything
docker-compose up --build

# Or run in background
docker-compose up -d --build

# Stop
docker-compose down
```

**For Development (with hot reload):**
```bash
# Start with hot reload enabled
docker-compose -f docker-compose.dev.yml up --build

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
- Setup Environment Variable (look av setup section under)

**Terminal 1 - Start Backend:**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Start Frontend:**

```bash
# Install and run
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) ✨

> **Note**: Local development runs in `DEV_MODE` which disables API key requirements. The frontend `.env.local` points to `http://localhost:8000` for the backend connection.

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

For production (EC2, VPS, etc.), you need to configure API keys for security:

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

**Generate a secure API key:**
```bash
# On Mac/Linux
openssl rand -hex 32

# Or use Python
python -c "import secrets; print(secrets.token_hex(32))"
```

>  **Important**:
> - Never commit `.env.local` or `.env.prod` files to git
> - Only commit `.env.local.example` files as templates
> - Use the same API key for both frontend and backend in production

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

## Tech Stack

**Frontend:**
- Next.js 
- React 
- Tailwind CSS 
- TypeScript

**Backend:**
- Python 
- FastAPI
- OpenCV with YuNet face detection

**Deployment:**
- Docker
- AWS EC2
- Nginx
- GitHub Actions - CI/CD

---


## Project Structure

```
BlurThatGuyProject/
├── app/                    # Next.js frontend
│   ├── api/                # Next.js API routes
│   ├── components/         # Components for landing page
│   ├── upload/             # Upload page & related
│   │   ├── components/     # Components for upload page
│   │   ├── hooks/          # Upload-related hooks
│   │   └── page.tsx        # Upload page
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx            # Main landing page
├── backend/                # Python FastAPI backend
│   ├── main.py             # Main backend file and API endpoints
│   ├── models/             # YuNet face detection model
│   └── requirements.txt    # Python dependencies
├── lib/                    # Shared TypeScript/JS utilities
│   ├── config.ts
│   ├── faceClient.ts
│   └── tracker.ts
├── public/                 # Static files
│   ├── favicon.ico
│   └── Test video/         # Example videos
├── docker-compose.yml      # Docker configuration
├── docker-compose.dev.yml  # Docker dev config
├── Dockerfile.backend      # Backend Dockerfile
├── Dockerfile.frontend     # Frontend Dockerfile
├── Dockerfile.frontend.dev # Frontend dev Dockerfile
├── README.md               # This file
├── LICENSE                 # MIT License
└── ...                     # Other config/scripts
```

---

## Docker Tips

**View logs:**
```bash
# All services
docker-compose logs -f

# Just frontend
docker-compose logs -f frontend

# Just backend
docker-compose logs -f backend
```

**Rebuild after code changes (production):**
```bash
docker-compose down
docker-compose up --build
```

**Clean rebuild (if something breaks):**
```bash
docker-compose down
docker system prune -a  # Warning: removes all unused Docker data
docker-compose up --build
```

**Check what's running:**
```bash
docker-compose ps
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
docker-compose down
docker system prune -a
docker-compose up --build
```

**Port already in use**
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
