# Deployment Guide

---

## Option 1 — Docker (Recommended)

**Requirements:** Docker Desktop, a server or local machine

```bash
git clone https://github.com/StianHa02/BlurThatGuyProject.git
cd BlurThatGuyProject
```

> **Optional:** For better face re-identification accuracy, download the full ArcFace model and place it in `backend/models/`:
> [`w600k_r50.onnx` on HuggingFace](https://huggingface.co/maze/faceX/blob/main/w600k_r50.onnx)

```bash
# Production
docker compose up --build

# Stop
docker compose down
```

Open [http://localhost:3000](http://localhost:3000)

---

## Option 2 — Local (No Docker)

**Requirements:** Node.js 20+, Python 3.11+, Redis, pnpm

**Terminal 1 — Backend (macOS/Linux):**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 1 — Backend (Windows PowerShell):**
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

> Local development runs in `DEV_MODE`, which disables API key authentication.

---

## Option 3 — AWS EC2 (Production)

### Infrastructure

| Node | Instance Type | Role |
|---|---|---|
| Primary | `c7i.8xlarge` | Main compute — 32 vCPU, Intel Sapphire Rapids |
| Secondary | `c7i-flex.large` | Burst overflow — 2 vCPU, cost-optimised |

Both nodes sit behind an **Application Load Balancer (ALB)**.

### ALB Configuration

- **Algorithm:** Least Outstanding Requests — new jobs go to the node with the lowest active workload
- **Sticky Sessions:** Enabled — once a user starts an upload, all requests are pinned to the same node (required because video files and Redis state are node-local)
- **Site URL:** Point the ALB to your domain (e.g. `blurthatguy.no`)

### EC2 Setup Per Node

```bash
# Install Docker
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER

# Clone and start
git clone https://github.com/StianHa02/BlurThatGuyProject.git
cd BlurThatGuyProject
docker compose up --build -d
```

### CI/CD (GitHub Actions)

The pipeline in `.github/workflows/` runs on every push to `main`:

1. Runs health checks on the frontend and backend containers
2. SSHs into each EC2 node and runs `docker compose up --build -d`

Required GitHub secrets:

| Secret | Description |
|---|---|
| `EC2_HOST` | Public IP or hostname of the primary node |
| `EC2_HOST_2` | Public IP or hostname of the secondary node |
| `EC2_USER` | SSH username (e.g. `ubuntu`) |
| `EC2_KEY` | Private SSH key |
| `API_KEY` | Shared API key between frontend and backend |

---

## Environment Variables

### Frontend (`.env.local` / `.env.prod`)

```bash
# Backend proxy (server-side only)
API_URL=http://backend:8000        # Docker
API_KEY=your-secure-api-key

# Optional: user integration (see docs/user-integration.md)
NEXT_PUBLIC_USER_INTEGRATION=0

NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=eu-north-1
AWS_S3_BUCKET_NAME=your-bucket-name
```

### Backend (`.env.prod`)

```bash
API_KEY=same-key-as-frontend
ALLOWED_ORIGINS=https://blurthatguy.no
REDIS_URL=redis://redis:6379

# Optional
MAX_UPLOAD_SIZE_MB=500
TOTAL_THREAD_BUDGET=28       # override CPU thread budget on high-core servers
```

---

## Docker Tips

```bash
# View logs
docker compose logs -f
docker compose logs -f backend

# Rebuild after code changes
docker compose down && docker compose up --build

# Full clean rebuild
docker compose down
docker system prune -a
docker compose up --build

# Check running containers
docker compose ps
```

---

## Troubleshooting

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

**Port already in use (Windows PowerShell)**
```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**No faces detected**
- Ensure faces are clearly visible and frontal
- Lower the sample rate slider (lower = more thorough)

**Detection is slow**
- Increase the sample rate (higher = faster, less thorough)
- Ensure the backend container has access to all CPU cores
