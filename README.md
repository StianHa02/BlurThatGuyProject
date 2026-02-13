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
   - Add environment variable:
     - `NEXT_PUBLIC_API_URL` = `https://your-ec2-domain.com` (your backend URL)
   - Click "Deploy"

3. **After deployment**, Vercel gives you a URL like `https://blurthatguy.vercel.app`

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
   - Click **"Add security group rule"** to add port 8000:
     - Type: **Custom TCP**
     - Port range: **8000**
     - Source: **Anywhere (0.0.0.0/0)**

7. **Configure Storage**:
   - Change to **20 GB** gp3 (default 8GB is too small for video processing)

8. Click **"Launch Instance"** 🚀

9. **Wait for instance to start** (~1-2 minutes), then note your **Public IPv4 address**

#### 2. Connect & Setup Server

```bash
# First, fix key file permissions (required on Mac/Linux)
chmod 400 ~/Downloads/blurthatguy-key.pem

# Connect to EC2 (replace with your EC2 public IP)
ssh -i ~/Downloads/blurthatguy-key.pem ubuntu@YOUR_EC2_PUBLIC_IP

# Example:
# ssh -i ~/Downloads/blurthatguy-key.pem ubuntu@54.123.45.67
```

Once connected, run these commands on the EC2 server:

# Update system
sudo apt update && sudo apt upgrade -y

# Install Python and dependencies
sudo apt install -y python3.11 python3.11-venv python3-pip nginx certbot python3-certbot-nginx

# Install OpenCV dependencies
sudo apt install -y libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev
```

#### 3. Deploy Backend

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
pip install -r requirements.txt

# Test it works
python main.py
# Press Ctrl+C to stop
```

#### 4. Create Systemd Service

```bash
sudo nano /etc/systemd/system/blurthatguy.service
```

Paste this:
```ini
[Unit]
Description=BlurThatGuy Backend API
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/blurthatguy/backend
Environment="PATH=/opt/blurthatguy/backend/venv/bin"
ExecStart=/opt/blurthatguy/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable blurthatguy
sudo systemctl start blurthatguy

# Check status
sudo systemctl status blurthatguy
```

#### 5. Setup Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/blurthatguy
```

Paste this:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or use EC2 public IP

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 500M;  # Allow large video uploads
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/blurthatguy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. (Optional) Add HTTPS with Let's Encrypt

```bash
# Point your domain to EC2 IP first, then:
sudo certbot --nginx -d your-domain.com
```

#### 7. Update CORS in Backend

Edit `backend/main.py` to allow your Vercel domain:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://blurthatguy.vercel.app",  # Add your Vercel URL
        "https://your-custom-domain.com",   # If using custom domain
    ],
    # ...
)
```

Restart the service:
```bash
sudo systemctl restart blurthatguy
```

---

### Environment Variables Summary

| Location | Variable | Value |
|----------|----------|-------|
| Vercel | `NEXT_PUBLIC_API_URL` | `https://your-ec2-domain.com` |
| Vercel | `NEXT_PUBLIC_API_KEY` | Your API key |
| EC2 Backend | `API_KEY` | Same API key as frontend |
| EC2 Backend | CORS origins | Add your Vercel URL in `backend/main.py` |

---

### 🔐 API Key Setup (Step-by-Step)

The API key protects your backend from unauthorized access.

#### Step 1: Generate an API Key (if you haven't already)

```bash
openssl rand -hex 32
```

This outputs something like: `03de579acf69eb4a94b446dd082a36350a131d52d89c9c91ef30f93187e61ac6`

**Save this key** - you'll use it in both frontend and backend.

---

#### Step 2: Add API Key to Vercel (Frontend)

1. Go to your project on [vercel.com](https://vercel.com)
2. Click **Settings** → **Environment Variables**
3. Add these two variables:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://your-ec2-domain.com` |
   | `NEXT_PUBLIC_API_KEY` | `03de579acf69eb4a94b446dd082a36350a131d52d89c9c91ef30f93187e61ac6` |

4. Click **Save**
5. Go to **Deployments** → Click the three dots on latest → **Redeploy**

---

#### Step 3: Add API Key to EC2 (Backend)

1. SSH into your EC2 instance:
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

2. Edit the systemd service file:
   ```bash
   sudo nano /etc/systemd/system/blurthatguy.service
   ```

3. Add the `API_KEY` environment variable (update the `[Service]` section):
   ```ini
   [Service]
   User=ubuntu
   WorkingDirectory=/opt/blurthatguy/backend
   Environment="PATH=/opt/blurthatguy/backend/venv/bin"
   Environment="API_KEY=03de579acf69eb4a94b446dd082a36350a131d52d89c9c91ef30f93187e61ac6"
   ExecStart=/opt/blurthatguy/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
   Restart=always
   ```

4. Save the file (`Ctrl+X`, then `Y`, then `Enter`)

5. Reload and restart the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart blurthatguy
   ```

6. Verify it's running:
   ```bash
   sudo systemctl status blurthatguy
   ```

---

#### Step 4: Test the Connection

1. Visit your Vercel frontend URL
2. Upload a video and click "Start Detection"
3. If it connects successfully, API key authentication is working!

**If you get errors:**
- Make sure the API key is exactly the same on both frontend and backend
- Check the backend logs: `sudo journalctl -u blurthatguy -f`
- Verify CORS includes your Vercel URL in `backend/main.py`

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
