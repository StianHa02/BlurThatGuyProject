# BlurThatGuy 🙈

AI-powered face detection and selective blurring for videos. Protect privacy with one click.

TODO: 
Switch to MediaPipe — YuNet misses partial and side faces which looks bad in a live demo. MediaPipe is a straight swap, no model download needed, handles real-world faces much better.
CI/CD pipeline — already done, just need to add the two GitHub secrets and clone the repo on EC2.
README — doesn't exist yet. Employers look at this first. Include what it does, a screenshot or GIF of it working, how to run locally, and the architecture decisions you can talk about in an interview.

Medium priority
Drop batch size to 25 — the progress bar currently jumps in one big chunk. Smaller batches make it feel more responsive and alive during a demo.
Switch MediaPipe in the Dockerfile — remove the wget model download block since MediaPipe bundles its own model.

Nice to have
A demo video in the README — a 30 second GIF or screen recording. Employers often won't run it locally so show it working.
Remove the excessive console.logs in useVideoExport.ts — there are about 10 debug logs in there from when you were fixing the stale closure bug. Clean those up before showing anyone the code.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

## Features

- 🎯 **AI Face Detection** - Powered by YuNet for accurate face detection
- 🎬 **Video Processing** - Upload MP4, WebM, or MOV files up to 100MB
- 👆 **Click to Blur** - Select which faces to anonymize
- ⚡ **Batch Processing** - Process 300 frames at once for maximum speed
- 📥 **Export** - Download processed video with faces permanently blurred
- 🔒 **Privacy First** - All processing happens on your computer

---



## 🚀 Quick Start

### Option 1: Run it on the your browser (Fastest)
[https://blurthatguy.no/](https://blurthatguy.no/)


### Option 2: Run with Docker

**Requirements:**
- Docker Desktop
- Setup EnvironmentVariable (look av setup section under)

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

# Code changes automatically reload!
# Frontend: Changes to app/ files reload instantly
# Backend: Changes to backend/ files reload automatically
```

Open [http://localhost:3000](http://localhost:3000) ✨

---

### Option 3: Run Locally

**Requirements:**
- Node.js 20+
- Python 3.11+
- pnpm (install with `npm install -g pnpm`)
- Setup EnvironmentVariable (look av setup section under)

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



## 📖 How to Use

1. **Upload Video**
   - Click "Upload" or drag & drop your video file
   - Supported formats: MP4, WebM, MOV
   - Max size: 100MB

2. **Detect Faces**
   - Click "Start Detection"
   - AI will scan through your video and find all faces
   - Processing time: ~10-15 seconds for a 2-minute video

3. **Select Faces to Blur**
   - Play the video
   - Click on faces with red frames to blur them
   - Selected faces appear pixelated
   - Click blurred faces to unblur

4. **Download**
   - Click "Download Video"
   - Your processed video will download with selected faces permanently blurred

---

## 🔐 Environment Configuration

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
ALLOWED_ORIGINS=http://your-domain.com
MAX_UPLOAD_SIZE_MB=100
```

**Generate a secure API key:**
```bash
# On Mac/Linux
openssl rand -hex 32

# Or use Python
python -c "import secrets; print(secrets.token_hex(32))"
```

> ⚠️ **Important**: 
> - Never commit `.env.local` or `.env.prod` files to git
> - Only commit `.env.local.example` files as templates
> - Use the same API key for both frontend and backend in production

---

## 🔧 Tech Stack

**Frontend:**
- Next.js 16
- React 19
- Tailwind CSS 4
- TypeScript

**Backend:**
- Python 3.11
- FastAPI
- OpenCV with YuNet face detection

---

## 📁 Project Structure

```
blurthatguy/
├── app/                    # Next.js frontend
│   ├── components/         # React components
│   ├── upload/             # Upload page & hooks
│   └── api/                # API routes
├── backend/                # Python FastAPI backend
│   ├── main.py             # API endpoints
│   ├── models/             # YuNet face detection model
│   └── requirements.txt    # Python dependencies
├── docker-compose.yml      # Docker configuration
└── README.md               # This file
```

---

## 💡 Docker Tips

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

## 🐛 Troubleshooting

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

## 🔐 Privacy & Security

- All video processing happens **locally** on your machine
- Videos are **not uploaded** to any external servers
- Processed videos are **not stored** anywhere
- Your data stays **100% private**

---

## 📝 License

MIT

---

Made by [stianha.com](https://stianha.com)