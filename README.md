# BlurThatGuy 🙈

AI-powered face detection and selective blurring for videos. Protect privacy with one click.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

## Features

- 🎯 **AI Face Detection** - Powered by YuNet for accurate face detection
- 🎬 **Video Processing** - Upload MP4, WebM, or MOV files
- 👆 **Click to Blur** - Select which faces to anonymize
- 📥 **Export** - Download processed video with faces permanently blurred
- 🔒 **Privacy First** - Processing happens locally

---

## 🐳 Quick Start with Docker (Recommended)

The easiest way to run the entire application:

```bash
# Clone the repository
git clone https://github.com/yourusername/blurthatguy.git
cd blurthatguy

# Start everything with Docker Compose
docker compose up --build
```

That's it! Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker Commands

```bash
# Start in background
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f

# Rebuild after changes
docker compose up --build
```

### Development with Docker

For hot-reloading during development:

```bash
docker compose -f docker-compose.dev.yml up --build
```

---

## 🛠️ Manual Setup

If you prefer to run without Docker:

### 1. Start the Python Backend

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
```

The backend runs on http://localhost:8000

### 2. Start the Frontend

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
blurthatguy/
├── app/                    # Next.js frontend
│   ├── components/         # Reusable UI components
│   ├── upload/            # Upload page with hooks & components
│   └── page.tsx           # Landing page
├── backend/               # Python FastAPI backend
│   ├── main.py           # API endpoints
│   ├── models/           # YuNet face detection model
│   └── requirements.txt
├── lib/                   # Shared utilities
├── docker-compose.yml     # Production Docker config
├── docker-compose.dev.yml # Development Docker config
└── Dockerfile.*          # Docker build files
```

---

## 🔧 Tech Stack

**Frontend:**
- Next.js 16 with App Router
- React 19
- Tailwind CSS 4
- Lucide Icons
- Framer Motion

**Backend:**
- Python 3.11
- FastAPI
- OpenCV with YuNet face detection
- NumPy

---

## 📝 License

MIT

---

Made by [stianha.com](https://stianha.com)
