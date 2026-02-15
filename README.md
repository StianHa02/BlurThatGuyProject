# BlurThatGuy 🙈


## TODO

docker compose up --build

Option 3: Batch Detection (Best, but requires frontend changes)
Instead of 300 separate requests, send frames in batches:


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

## 🛠️ Local Development (No Docker)

The easiest way to run locally - no Docker needed!

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Frontend:**
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) ✨

> **First time?** Run `cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt` first.

---

## 🐳 Docker Setup (Alternative)

If you prefer Docker (requires Docker Desktop to be running):

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
├── app/                    # Next.js frontend (App Router)
│   ├── components/         # Shared React UI components
│   ├── upload/             # Upload page, hooks, and upload-specific components
│   │   ├── components/     # Upload page UI components (DropZone, ProgressBar, etc.)
│   │   └── hooks/          # Custom React hooks for upload, detection, export
│   └── api/                # Next.js API routes (proxy to backend)
├── backend/                # Python FastAPI backend
│   ├── main.py             # API endpoints (face detection, video export)
│   ├── models/             # YuNet ONNX face detection model
│   └── requirements.txt    # Python dependencies
├── lib/                    # Shared TypeScript utilities (frontend)
├── public/                 # Static assets (test videos, favicon, etc.)
├── docker-compose.yml      # Production Docker Compose config
├── docker-compose.dev.yml  # Development Docker Compose config (hot reload)
├── Dockerfile.frontend     # Docker build for Next.js frontend
├── Dockerfile.backend      # Docker build for FastAPI backend
├── README.md               # Project documentation
├── package.json            # Frontend dependencies and scripts
├── pnpm-workspace.yaml     # pnpm monorepo config
├── tsconfig.json           # TypeScript config
└── ...                     # Other config and dotfiles
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

## 🚀 Deployment

### Frontend → Vercel

1. **Push to GitHub** (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/blurthatguy.git
   git push -u origin main
   ```

2. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com) and sign in with GitHub
   - Click "New Project" → Import your `blurthatguy` repository
   - Configure the project:
     - **Framework Preset**: Next.js
     - **Root Directory**: `./` (leave default)
   - Add environment variables (server-side only, not NEXT_PUBLIC):
     - `API_URL` = `https://your-domain.com` (your backend URL)
     - `API_KEY` = `your-api-key-from-step-3` (same key from backend)
   - Click "Deploy"

3. **After deployment**, Vercel gives you a URL like `https://blurthatguy.vercel.app`

**🔒 Security Note**: We use server-side `API_URL` and `API_KEY` (not `NEXT_PUBLIC_*`) so the API key never exposes to the browser. Your Next.js API routes will proxy requests to the backend.

---

#### 10. Configure Frontend to Use Backend

Your Next.js app should have API routes in `app/api/` that proxy requests to your backend. Ensure these routes read from environment variables:

```typescript
// Example: app/api/upload-video/route.ts
const API_URL = process.env.API_URL; // Server-side only
const API_KEY = process.env.API_KEY;

export async function POST(request: Request) {
  const formData = await request.formData();
  
  const response = await fetch(`${API_URL}/upload-video`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
    },
    body: formData,
  });
  
  return response;
}
```

**Important**: Your frontend code should call `/api/upload-video` (relative path), NOT the backend directly. This keeps your API key secure.

---

### Backend → AWS EC2

#### 🆕 New to AWS? Start Here

If you don't have an AWS account yet:

1. **Create AWS Account**: Go to [aws.amazon.com](https://aws.amazon.com) → Click "Create an AWS Account"
2. **Add payment method** (required, but EC2 free tier gives you 750 hrs/month free for 12 months)
3. **Enable MFA** (recommended): Go to IAM → Your Security Credentials → Assign MFA device

#### 1. Launch EC2 Instance

1. Go to [AWS Console](https://console.aws.amazon.com/ec2) → Click **"Launch Instance"**

2. **Name your instance**: `blurthatguy-backend`

3. **Choose AMI (Operating System)**:
   - Select **Ubuntu Server 22.04 LTS (HVM), SSD Volume Type**
   - Architecture: **64-bit (x86)**

4. **Choose Instance Type**:
   - Select **t3.small** (2 vCPU, 2GB RAM) - ~$0.02/hr
   - Or **t3.micro** for free tier (may be slow for video processing)

5. **Create Key Pair** (for SSH access):
   - Click **"Create new key pair"**
   - Name: `blurthatguy-key`
   - Type: **RSA**
   - Format: **.pem** (for Mac/Linux) or **.ppk** (for Windows/PuTTY)
   - Click **"Create key pair"** - file downloads automatically
   - **⚠️ Save this file safely!** You can't download it again.

6. **Network Settings** - Click **"Edit"** and configure:
   - **Allow SSH traffic**: ✅ Yes (from "My IP" for security)
   - **Allow HTTPS traffic**: ✅ Yes
   - **Allow HTTP traffic**: ✅ Yes
   
   > **🔒 Security Note**: Do NOT open port 8000 to the internet. Nginx will handle all public traffic on ports 80/443 and proxy to port 8000 internally.

7. **Configure Storage**:
   - Change to **20 GB** gp3 (default 8GB is too small for video processing)

8. Click **"Launch Instance"** 🚀

9. **Wait for instance to start** (~1-2 minutes), then note your **Public IPv4 address**

#### 2. Connect & Setup Server

```bash
# First, fix key file permissions (required on Mac/Linux)
chmod 400 ~/.ssh/blurthatguy-key.pem

# Connect to EC2 (replace with your EC2 public IP)
ssh -i ~/.ssh/blurthatguy-key.pem ubuntu@13.61.41.5 

```

Once connected, run these commands on the EC2 server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python and dependencies
sudo apt install -y python3.11 python3.11-venv python3-pip nginx certbot python3-certbot-nginx

# Install OpenCV dependencies
sudo apt install -y libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev
```

#### 3. Generate API Key

First, generate a strong API key that will be used for authentication:

```bash
# Generate a secure API key
openssl rand -hex 32
```

This outputs something like: `03de579acf69eb4a94b446dd082a36350a131d52d89c9c91ef30f93187e61ac6`

**💾 Save this key** - you'll need it for both the backend configuration and Vercel environment variables.

#### 4. Deploy Backend

```bash
# Create app directory
sudo mkdir -p /opt/blurthatguy
sudo chown ubuntu:ubuntu /opt/blurthatguy
cd /opt/blurthatguy

# Clone repository (or copy files)
git clone https://github.com/yourusername/blurthatguy.git .

# Setup Python environment
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Test it works
uvicorn main:app --host 127.0.0.1 --port 8000
# Press Ctrl+C to stop after verifying it starts
```

#### 5. Create Environment File

Create a secure environment file for your backend configuration:

```bash
sudo nano /etc/blurthatguy.env
```

Add the following (replace with your actual values):

```ini
# Backend API configuration
API_KEY=03de579acf69eb4a94b446dd082a36350a131d52d89c9c91ef30f93187e61ac6
ALLOWED_ORIGINS=https://blurthatguy.vercel.app,https://your-custom-domain.com
MAX_UPLOAD_SIZE_MB=500
```

Secure the file:

```bash
sudo chown root:root /etc/blurthatguy.env
sudo chmod 600 /etc/blurthatguy.env
```

#### 6. Create Systemd Service

```bash
sudo nano /etc/systemd/system/blurthatguy.service
```

Paste this:
```ini
[Unit]
Description=BlurThatGuy FastAPI Backend
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/blurthatguy/backend
EnvironmentFile=/etc/blurthatguy.env
ExecStart=/opt/blurthatguy/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2 --timeout-keep-alive 30
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

**Note**: We bind to `127.0.0.1:8000` (localhost only) for security. Nginx will handle public traffic.

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable blurthatguy
sudo systemctl start blurthatguy

# Check status
sudo systemctl status blurthatguy

# View logs
sudo journalctl -u blurthatguy -f
```

#### 7. Setup Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/blurthatguy
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your actual domain

    # Increase upload size for video files
    client_max_body_size 500M;
    client_body_buffer_size 16M;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for video processing
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/blurthatguy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 8. Add HTTPS with Let's Encrypt

**⚠️ Important**: You must have a domain name pointing to your EC2 IP for this to work.

```bash
# Point your domain to EC2 IP first, then:
sudo certbot --nginx -d your-domain.com

# Follow the prompts
# Certbot will automatically update your nginx config
```

Test auto-renewal:
```bash
sudo certbot renew --dry-run
```

#### 9. Test the Backend

```bash
# Test from EC2 (should work without API key on localhost)
curl http://127.0.0.1:8000/health

# Test from your computer (requires API key)
curl -H "X-API-Key: your-api-key-here" https://your-domain.com/health
```

Expected response: `{"status":"ok","model":"YuNet"}`

---

### Environment Variables Summary

| Location | Variable | Value | Scope |
|----------|----------|-------|-------|
| **Vercel** | `API_URL` | `https://your-domain.com` | Server-side (secure) |
| **Vercel** | `API_KEY` | Your generated API key | Server-side (secure) |
| **EC2** | `API_KEY` | Same API key as Vercel | Via `/etc/blurthatguy.env` |
| **EC2** | `ALLOWED_ORIGINS` | `https://blurthatguy.vercel.app,https://your-custom-domain.com` | Via `/etc/blurthatguy.env` |
| **EC2** | `MAX_UPLOAD_SIZE_MB` | `500` | Via `/etc/blurthatguy.env` |

**🔒 Security Best Practice**: Never use `NEXT_PUBLIC_*` environment variables for API keys or backend URLs. These expose values to the browser. Instead, use server-side env vars and proxy requests through Next.js API routes.

---

### 🔐 API Key Setup Summary

The API key is now configured in the deployment steps above. Here's a quick reference:

#### Where the API Key is Used:

1. **Backend (EC2)**: 
   - Stored in `/etc/blurthatguy.env`
   - Read by the systemd service
   - Validates incoming requests via `X-API-Key` header

2. **Frontend (Vercel)**:
   - Stored as `API_KEY` environment variable (server-side only)
   - Used by Next.js API routes to authenticate with backend
   - Never exposed to browser

#### Testing the Connection

1. Visit your Vercel frontend URL
2. Upload a video and click "Start Detection"
3. If it connects successfully, API key authentication is working!

**If you get errors:**
- Verify API key is identical on both backend and frontend
- Check backend logs: `sudo journalctl -u blurthatguy -f`
- Ensure `ALLOWED_ORIGINS` in `/etc/blurthatguy.env` includes your Vercel URL
- Test backend directly: `curl -H "X-API-Key: your-key" https://your-domain.com/health`

---

### 💡 Start/Stop EC2 On-Demand (Save Money for Demos)

You can stop your EC2 instance when not in use and only start it for demos. This saves money since you only pay for running instances.

#### Option 1: AWS Console (Easiest)

1. Go to [EC2 Dashboard](https://console.aws.amazon.com/ec2)
2. Select your instance
3. Click **Instance State** → **Stop instance** (to pause) or **Start instance** (to resume)

> ⚠️ **Note**: Your public IP may change when you restart. Use an Elastic IP (free when attached to a running instance) for a fixed IP.

#### Option 2: AWS CLI (Quick Commands)

Install AWS CLI and configure it once:
```bash
# Install (macOS)
brew install awscli

# Configure with your AWS credentials
aws configure
```

Then use these commands:
```bash
# Get your instance ID first
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,Tags[?Key==`Name`].Value,State.Name]' --output table

# Start the instance
aws ec2 start-instances --instance-ids i-YOUR_INSTANCE_ID

# Stop the instance
aws ec2 stop-instances --instance-ids i-YOUR_INSTANCE_ID

# Check status
aws ec2 describe-instance-status --instance-ids i-YOUR_INSTANCE_ID
```

#### Option 3: Simple Shell Scripts

Create these scripts for easy demo management:

**`start-backend.sh`**
```bash
#!/bin/bash
INSTANCE_ID="i-YOUR_INSTANCE_ID"
aws ec2 start-instances --instance-ids $INSTANCE_ID
echo "Starting EC2... waiting for it to be ready"
aws ec2 wait instance-running --instance-ids $INSTANCE_ID
PUBLIC_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "✅ Backend ready at: http://$PUBLIC_IP:8000"
```

**`stop-backend.sh`**
```bash
#!/bin/bash
INSTANCE_ID="i-YOUR_INSTANCE_ID"
aws ec2 stop-instances --instance-ids $INSTANCE_ID
echo "✅ EC2 instance stopping... (saves money!)"
```

Make them executable: `chmod +x start-backend.sh stop-backend.sh`

#### Option 4: Elastic IP (Recommended for Demos)

To keep the same IP address after stopping/starting:

1. Go to **EC2** → **Elastic IPs** → **Allocate Elastic IP address**
2. Select the new IP → **Actions** → **Associate Elastic IP address**
3. Choose your instance and save

Now the IP stays the same even when you stop/start the instance!

> 💰 **Cost**: Elastic IPs are free when associated with a running instance. You only pay (~$0.005/hr) when the instance is stopped but the IP is still allocated.

#### Typical Demo Workflow

```bash
# 5 minutes before demo
./start-backend.sh

# Do your demo...

# After demo (save money!)
./stop-backend.sh
```

---

Made by [stianha.com](https://stianha.com)