# 🚀 BlurThatGuy EC2 Deployment Guide

Complete guide to deploying BlurThatGuy on AWS EC2 with Docker.

---

## ⚡ Quick Start (Your Setup)

You have:
- ✅ Elastic IP already allocated
- ✅ `setup-ssl-blurthatguy.sh` script in project root
- ✅ Domain: `blurthatguy.no`

**Fast track to production:**
1. Follow Steps 1-6 to get Docker containers running
2. Point DNS A records (`@` and `www`) to your Elastic IP
3. Run: `cd ~/blurthatguy && ./setup-ssl-blurthatguy.sh`
4. Done! → `https://blurthatguy.no` 🎉

For detailed instructions, continue reading below.

---

## 📋 Prerequisites

- AWS Account
- Domain name: `blurthatguy.no` ✅
- Elastic IP allocated ✅
- Basic terminal/SSH knowledge
- Git installed on your local machine

---

## 🔧 Step 1: Launch EC2 Instance

### 1.1 Choose Instance Type

1. Log into AWS Console → EC2 Dashboard
2. Click **"Launch Instance"**
3. Configure:
   - **Name**: `blurthatguy-server`
   - **AMI**: Ubuntu Server 24.04 LTS (Free tier eligible)
   - **Instance Type**: `t3.medium` (recommended) or `t3.large` for better performance
     - t3.medium: 2 vCPU, 4GB RAM (~$30/month)
     - t3.large: 2 vCPU, 8GB RAM (~$60/month)

> ⚠️ **Note**: t2.micro (free tier) has only 1GB RAM and will likely run out of memory during video processing.

### 1.2 Configure Key Pair

1. **Key pair**: Create new key pair
   - Name: `blurthatguy-key`
   - Type: RSA
   - Format: `.pem` (for Mac/Linux) or `.ppk` (for Windows with PuTTY)
2. Download and save the key file
3. On Mac/Linux, set permissions:
   ```bash
   chmod 400 ~/Downloads/blurthatguy-key.pem
   ```

### 1.3 Network Settings

1. **Firewall (Security Group)**: Create new security group
   - Name: `blurthatguy-sg`
   - Description: `Security group for BlurThatGuy app`

2. **Inbound Rules**:
   - SSH: Port 22 (Source: My IP or 0.0.0.0/0)
   - HTTP: Port 80 (Source: 0.0.0.0/0)
   - HTTPS: Port 443 (Source: 0.0.0.0/0)
   - Custom TCP: Port 3000 (Source: 0.0.0.0/0) - For Next.js
   - Custom TCP: Port 8000 (Source: 0.0.0.0/0) - For FastAPI

### 1.4 Configure Storage

- **Storage**: 30 GB gp3 (good for video processing)
- Default 8GB is too small for Docker images + videos

### 1.5 Launch Instance

Click **"Launch Instance"** and wait for it to start.

---

## 🔌 Step 2: Connect to Your EC2 Instance

### Get Your Instance IP

1. Go to EC2 Dashboard → Instances
2. Select your instance
3. Copy the **Public IPv4 address** (e.g., `54.123.45.67`)

### Connect via SSH

**Mac/Linux:**
```bash
ssh -i ~/.ssh/blurthatguy-key.pem ubuntu@13.62.202.27
```

**Windows (PowerShell):**
```powershell
ssh -i C:\Users\YourName\Downloads\blurthatguy-key.pem ubuntu@54.123.45.67
```

**Windows (PuTTY):**
- Host: `ubuntu@54.123.45.67`
- Port: 22
- Auth → Private key: Select your `.ppk` file

---

## 📦 Step 3: Install Dependencies on EC2

### 3.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.2 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (no need for sudo)
sudo usermod -aG docker ubuntu

# Start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Log out and back in for group changes to take effect
exit
```

**Reconnect to SSH** (same command as before), then verify:

```bash
docker --version
# Should show: Docker version 24.x.x or higher
```

### 3.3 Install Docker Compose

```bash
# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Make executable
sudo chmod +x /usr/local/bin/docker-compose

# Verify
docker-compose --version
# Should show: Docker Compose version v2.x.x or higher
```

### 3.4 Install Git

```bash
sudo apt install git -y
git --version
```

---

## 📥 Step 4: Clone and Configure Your Project

### 4.1 Clone Repository

```bash
cd ~
git clone https://github.com/StianHa02/BlurThatGuyProject.git
cd blurthatguy
```

> 💡 **Don't have a repo?** Upload your code using SCP or create a zip:
> ```bash
> # On your local machine:
> scp -i ~/Downloads/blurthatguy-key.pem -r ./blurthatguy ubuntu@54.123.45.67:~/
> ```

### 4.2 Create Production Environment File

Generate a secure API key:

```bash
# Generate random API key
openssl rand -hex 32
# Example output: a7b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

Create environment file for production:

```bash
# Create backend environment file
nano /etc/blurthatguy.env
```

Add this content (replace with your actual API key):

```bash
# PRODUCTION ENVIRONMENT - DO NOT COMMIT TO GIT

# API Key (use the one you generated above)
API_KEY=

# CORS - Add your domain when you have one
ALLOWED_ORIGINS=http://54.123.45.67:3000,http://localhost:3000

# Upload limits
MAX_UPLOAD_SIZE_MB=100

# Development mode - MUST be false or unset in production
DEV_MODE=true
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

**Set proper permissions:**

```bash
sudo chown root:root /etc/blurthatguy.env
sudo chmod 600 /etc/blurthatguy.env
```

### 4.3 Create Frontend Environment File

```bash
cd ~/blurthatguy
nano .env.production
```

Add this content (use the SAME API key):

```bash
# Production Frontend Environment

# Backend API URL (Docker internal network)
API_URL=http://backend:8000

# API Key (must match backend)
API_KEY=a7b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# Backend URL for client-side calls
NEXT_PUBLIC_BACKEND_URL=http://54.123.45.67:8000
```

Save and exit.

---

## 🚀 Step 5: Build and Start the Application

### 5.1 Build Docker Images

```bash
cd ~/blurthatguy
docker-compose -f docker-compose.yml build --no-cache
```

This will take 5-10 minutes. ☕

### 5.2 Start the Application

```bash
docker-compose -f docker-compose.yml up -d
```

The `-d` flag runs containers in the background (detached mode).

### 5.3 Verify Everything is Running

```bash
# Check container status
docker-compose -f docker-compose.yml ps

# Should show both containers running:
# NAME                     STATUS
# blurthatguy-backend-1    Up About a minute (healthy)
# blurthatguy-frontend-1   Up About a minute (healthy)

# View logs
docker-compose -f docker-compose.yml logs -f

# Test backend
curl http://localhost:8000/health
# Should return: {"status":"healthy"}

# Test frontend (from your local machine)
# Open: http://54.123.45.67:3000
```

---

## 🌐 Step 6: Set Up Nginx for Port 80 Access

Instead of accessing your app at `http://YOUR_IP:3000`, we'll set up Nginx so you can access it directly at `http://YOUR_IP`.

### 6.1 Install Nginx

```bash
sudo apt update
sudo apt install nginx -y
```

### 6.2 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/blurthatguy
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name _;  # Accepts any domain/IP
    
    # Increase upload size for videos
    client_max_body_size 100M;
    
    # Timeouts for video processing
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;

    # Frontend (Next.js) - serves everything by default
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API - proxy /api/ requests to FastAPI
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeout for video processing
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

### 6.3 Enable Nginx Configuration

```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/blurthatguy /etc/nginx/sites-enabled/

# Remove default site (optional but recommended)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# If test passes, restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 6.4 Verify Nginx is Working

```bash
# Check Nginx status
sudo systemctl status nginx

# Test locally
curl http://localhost

# Check what's on port 80
sudo netstat -tulpn | grep :80
```

### 6.5 Access Your Application

Your app is now accessible at:
- **Frontend**: `http://54.123.45.67` ✨ (no port needed!)
- **Backend API**: `http://54.123.45.67/api/` (proxied through Nginx)

### 6.6 Optional: Secure Ports 3000 and 8000

For better security, remove direct access to ports 3000 and 8000:

1. Go to AWS Console → EC2 → Security Groups
2. Select your security group
3. **Remove** the inbound rules for ports 3000 and 8000
4. Keep only: SSH (22), HTTP (80), HTTPS (443)

Now users can ONLY access through Nginx on port 80 - much more secure!

> 💡 **Ready for HTTPS with your domain?** Jump to Step 7 for automated setup with the `setup-ssl-blurthatguy.sh` script!

---

## 🔒 Step 7: Set Up Custom Domain & HTTPS (Optional but Recommended)

You have two options: automated setup (recommended) or manual setup.

### Option A: Automated Setup Script (Easiest!) 🚀

The project includes `setup-ssl-blurthatguy.sh` in the root folder that handles everything automatically.

**Before running the script:**

1. **Point your DNS to your Elastic IP:**
   - Go to your domain registrar (where you bought blurthatguy.no)
   - Add two A records:
     
     | Type | Host | Points To | TTL |
     |------|------|-----------|-----|
     | A    | @    | YOUR_ELASTIC_IP | 3600 |
     | A    | www  | YOUR_ELASTIC_IP | 3600 |
   
   - Wait 5-10 minutes for DNS propagation

2. **Verify DNS is working:**
   ```bash
   # Check if DNS points to your server
   dig +short blurthatguy.no
   # Should show your Elastic IP
   ```

3. **Make sure Docker containers are running:**
   ```bash
   cd ~/blurthatguy
   docker-compose -f docker-compose.prod.yml ps
   # Both containers should show "Up" status
   ```

**Run the automated setup:**
```bash
cd ~/blurthatguy
chmod +x setup-ssl-blurthatguy.sh
./setup-ssl-blurthatguy.sh
```

The script will:
- ✅ Install Nginx and Certbot
- ✅ Configure Nginx for blurthatguy.no
- ✅ Set up CORS settings
- ✅ Check DNS configuration
- ✅ Get free SSL certificate from Let's Encrypt
- ✅ Configure auto-renewal

**After the script completes:**
- 🔒 https://blurthatguy.no - Live and secure!
- 🔒 https://www.blurthatguy.no - Live and secure!
- HTTP requests automatically redirect to HTTPS

**Next: Close ports 3000 and 8000 in your Security Group for better security**

Skip to Step 8 if you use the automated script!

---

### Option B: Manual Setup (Step-by-Step)

If you prefer to do it manually, follow these steps:

### 7.1 Point Domain to Your Elastic IP

Since you already have an Elastic IP associated with your instance:

1. Go to your domain registrar (where you bought blurthatguy.no)
2. Add two A records:
   - **Host**: `@` (root domain)
   - **Points to**: Your Elastic IP
   - **TTL**: 3600 (or Auto)
   
   - **Host**: `www` (www subdomain)
   - **Points to**: Your Elastic IP
   - **TTL**: 3600 (or Auto)

Wait 5-10 minutes for DNS propagation.

### 7.2 Update Nginx for Your Domain

```bash
sudo nano /etc/nginx/sites-available/blurthatguy
```

Change the `server_name` line:

```nginx
server {
    listen 80;
    server_name blurthatguy.no www.blurthatguy.no;  # Your domain
    
    # ... rest stays the same
}
```

Save and restart Nginx:

```bash
sudo nginx -t
sudo systemctl restart nginx
```

### 7.3 Update CORS Settings

Update the backend environment to allow your domain:

```bash
sudo nano /etc/blurthatguy.env
```

Update `ALLOWED_ORIGINS`:
```bash
ALLOWED_ORIGINS=http://blurthatguy.no,https://blurthatguy.no,http://www.blurthatguy.no,https://www.blurthatguy.no
```

Restart containers:
```bash
cd ~/blurthatguy
docker-compose -f docker-compose.prod.yml restart
```

### 7.4 Get Free SSL Certificate with Let's Encrypt

Now let's add HTTPS for secure connections!

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (it will auto-configure Nginx)
sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no
```

Follow the prompts:
- Enter your email address
- Agree to terms of service
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

Certbot will:
- Verify domain ownership
- Install SSL certificates
- Auto-configure Nginx for HTTPS
- Set up auto-renewal

**Test your secure site:**
```bash
curl https://blurthatguy.no
```

Your app is now available at:
- **https://blurthatguy.no** ✅ (Secure!)
- **https://www.blurthatguy.no** ✅ (Secure!)
- HTTP requests automatically redirect to HTTPS

### 7.5 Verify Auto-Renewal

SSL certificates expire after 90 days, but Certbot sets up automatic renewal:

```bash
# Test renewal process (dry run)
sudo certbot renew --dry-run

# Check renewal timer
sudo systemctl status certbot.timer
```

---

## 🔄 Step 8: Managing Your Application

### Start/Stop/Restart

```bash
cd ~/blurthatguy

# Stop
docker-compose -f docker-compose.prod.yml down

# Start
docker-compose -f docker-compose.prod.yml up -d

# Restart
docker-compose -f docker-compose.prod.yml restart

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build
```

### View Logs

```bash
# All logs
docker-compose -f docker-compose.prod.yml logs -f

# Just backend
docker-compose -f docker-compose.prod.yml logs -f backend

# Just frontend
docker-compose -f docker-compose.prod.yml logs -f frontend

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100
```

### Update Code

```bash
cd ~/blurthatguy

# Pull latest changes
git pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### Auto-start on System Reboot

Docker containers with `restart: unless-stopped` will automatically restart after a server reboot.

Verify:
```bash
sudo reboot
# Wait 2 minutes, then SSH back in
docker ps
# Should show containers running
```

---

## 📊 Step 9: Monitoring and Maintenance

### Check System Resources

```bash
# Disk space
df -h

# Memory usage
free -h

# Docker stats
docker stats

# Container health
docker-compose -f docker-compose.prod.yml ps
```

### Clean Up Old Docker Data

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove everything unused
docker system prune -a --volumes
```

**Warning**: This will remove ALL unused Docker data. Only run if you're sure.

### Set Up Automatic Cleanup

Create a cron job to clean old videos:

```bash
crontab -e
```

Add this line (clean videos older than 24 hours every day at 3 AM):

```bash
0 3 * * * find ~/blurthatguy/backend/videos -type f -mtime +1 -delete
```

---

## 🛡️ Security Best Practices

### 1. Firewall Configuration

```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

### 2. Disable Root Login

```bash
sudo nano /etc/ssh/sshd_config
```

Find and change:
```bash
PermitRootLogin no
PasswordAuthentication no
```

Restart SSH:
```bash
sudo systemctl restart sshd
```

### 3. Keep System Updated

```bash
# Create update script
nano ~/update.sh
```

Add:
```bash
#!/bin/bash
sudo apt update && sudo apt upgrade -y
docker system prune -f
```

Make executable and run weekly:
```bash
chmod +x ~/update.sh
crontab -e
# Add: 0 2 * * 0 ~/update.sh
```

### 4. Monitor Failed Login Attempts

```bash
# Install fail2ban
sudo apt install fail2ban -y

# Enable and start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check status
sudo fail2ban-client status sshd
```

---

## 🐛 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Check specific container
docker logs blurthatguy-backend-1

# Rebuild from scratch
docker-compose -f docker-compose.prod.yml down
docker system prune -a
docker-compose -f docker-compose.prod.yml up -d --build
```

### Out of Memory

```bash
# Check memory
free -h

# Add swap space (4GB)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Disk Full

```bash
# Check disk usage
df -h
du -sh ~/blurthatguy/*

# Clean Docker
docker system prune -a --volumes

# Clean old videos
find ~/blurthatguy/backend/videos -type f -mtime +1 -delete
```

### Can't Connect to App

```bash
# Check if containers are running
docker ps

# Check if Nginx is running
sudo systemctl status nginx

# Check if port 80 is open
sudo netstat -tulpn | grep :80

# Check security group in AWS Console
# Make sure port 80 is allowed

# Test from inside EC2
curl http://localhost
curl http://localhost:3000
curl http://localhost:8000/health
```

### Nginx Issues

**Port 80 Already in Use:**
```bash
# See what's using port 80
sudo netstat -tulpn | grep :80

# If Apache is running
sudo systemctl stop apache2
sudo systemctl disable apache2

# Restart Nginx
sudo systemctl restart nginx
```

**502 Bad Gateway Error:**
```bash
# This means Nginx can't reach Docker containers
# Check if containers are running
docker ps

# Check if services respond locally
curl http://localhost:3000
curl http://localhost:8000/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart everything
docker-compose -f docker-compose.prod.yml restart
sudo systemctl restart nginx
```

**Nginx Configuration Error:**
```bash
# Test configuration
sudo nginx -t

# View configuration
sudo cat /etc/nginx/sites-available/blurthatguy

# Check for typos, missing semicolons, or unclosed brackets
# Re-edit if needed
sudo nano /etc/nginx/sites-available/blurthatguy

# Restart after fixing
sudo systemctl restart nginx
```

**Can't Access After Setting Up Nginx:**
```bash
# Verify Nginx is enabled and running
sudo systemctl status nginx
sudo systemctl enable nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Make sure port 80 is open in AWS Security Group
# EC2 Console → Security Groups → Inbound Rules
# Should have: HTTP (80) from 0.0.0.0/0
```

### Upload Fails (413 Error)

Check Nginx configuration if using reverse proxy:

```bash
sudo nano /etc/nginx/sites-available/blurthatguy
```

Ensure this line exists:
```nginx
client_max_body_size 100M;
```

Restart Nginx:
```bash
sudo systemctl restart nginx
```

---

## 💰 Cost Estimation

### Monthly AWS Costs (US East 1)

| Instance Type | vCPU | RAM  | Storage | Monthly Cost |
|--------------|------|------|---------|--------------|
| t3.medium    | 2    | 4GB  | 30GB    | ~$30-35      |
| t3.large     | 2    | 8GB  | 30GB    | ~$60-65      |
| t3.xlarge    | 4    | 16GB | 30GB    | ~$120-130    |

**Additional Costs:**
- Elastic IP: $0 (if attached to running instance)
- Data Transfer: ~$0.09/GB (first 10TB)
- Storage: ~$3/month for 30GB gp3

**Total Estimated Cost**: $30-70/month depending on instance type

### Cost Optimization Tips

1. **Use Reserved Instances**: Save up to 40% with 1-year commitment
2. **Stop when not in use**: Stop instance during off-hours (you'll still pay for storage)
3. **Use Spot Instances**: Save up to 90% (but can be interrupted)
4. **Monitor usage**: Set up AWS billing alerts

---

## 🎯 Quick Reference

### Essential Commands

```bash
# SSH into EC2
ssh -i ~/blurthatguy-key.pem ubuntu@YOUR_IP

# Navigate to project
cd ~/blurthatguy

# Docker commands
docker-compose -f docker-compose.prod.yml logs -f       # View logs
docker-compose -f docker-compose.prod.yml restart        # Restart app
docker-compose -f docker-compose.prod.yml down           # Stop app
docker-compose -f docker-compose.prod.yml up -d          # Start app
git pull && docker-compose -f docker-compose.prod.yml up -d --build  # Update code

# Nginx commands
sudo systemctl status nginx          # Check Nginx status
sudo systemctl restart nginx         # Restart Nginx
sudo nginx -t                        # Test Nginx config
sudo tail -f /var/log/nginx/error.log    # View Nginx errors
sudo tail -f /var/log/nginx/access.log   # View access logs
```

### Important Files

- **Backend config**: `/etc/blurthatguy.env`
- **Frontend config**: `~/blurthatguy/.env.production`
- **Docker compose**: `~/blurthatguy/docker-compose.prod.yml`
- **Nginx config**: `/etc/nginx/sites-available/blurthatguy`
- **SSL certs**: `/etc/letsencrypt/live/blurthatguy.no/`

### Useful URLs

- **AWS Console**: https://console.aws.amazon.com/ec2
- **Let's Encrypt**: https://letsencrypt.org/
- **Docker Docs**: https://docs.docker.com/
- **UFW Guide**: https://help.ubuntu.com/community/UFW

---

## ✅ Deployment Checklist

**Core Setup:**
- [ ] EC2 instance launched (t3.medium or larger)
- [ ] Security group configured (ports 22, 80, 443)
- [ ] SSH key downloaded and secured
- [ ] Connected to EC2 via SSH
- [ ] Docker and Docker Compose installed
- [ ] Code cloned/uploaded to EC2
- [ ] API key generated
- [ ] Environment files created (`/etc/blurthatguy.env` and `.env.production`)
- [ ] Docker containers built and running
- [ ] App accessible at `http://YOUR_IP:3000`

**Nginx & Domain Setup:**
- [ ] Nginx installed and configured on port 80
- [ ] App accessible at `http://YOUR_IP` (no port needed!)
- [ ] Security group ports 3000/8000 closed (optional but recommended)

**Domain & SSL (Optional - Choose One Method):**
- [ ] Elastic IP allocated and associated
- [ ] DNS A records point to Elastic IP (blurthatguy.no and www.blurthatguy.no)
- [ ] **Method 1**: Run `setup-ssl-blurthatguy.sh` automated script ⚡ (recommended)
- [ ] **Method 2**: Manual SSL setup with Certbot
- [ ] Site accessible at `https://blurthatguy.no` 🔒

**Security & Maintenance:**
- [ ] Firewall configured (UFW)
- [ ] Automatic updates scheduled
- [ ] Monitoring set up
- [ ] Backup strategy in place

---

## 🆘 Getting Help

If you run into issues:

1. **Check logs first**: 
   - Docker: `docker-compose -f docker-compose.prod.yml logs -f`
   - Nginx: `sudo tail -f /var/log/nginx/error.log`
2. **Review this guide**: Most issues are covered in Troubleshooting section
3. **AWS Support**: https://aws.amazon.com/support
4. **Docker Forums**: https://forums.docker.com/
5. **Stack Overflow**: Tag questions with `aws-ec2`, `docker`, `nextjs`, `fastapi`, `nginx`

---

## 🎉 Success!

Your BlurThatGuy app should now be running on EC2! 

**Access your app**:
- Via IP (with Nginx): `http://YOUR_EC2_IP` ✨ (no port needed!)
- Via IP (direct): `http://YOUR_EC2_IP:3000` (if you didn't close port 3000)
- Via domain: `https://blurthatguy.no` 🔒 (when configured with SSL)

**What you've accomplished:**
- ✅ Full-stack app running on AWS EC2
- ✅ Professional Nginx reverse proxy
- ✅ Clean URLs without port numbers
- ✅ (Optional) Secure HTTPS with free SSL certificate
- ✅ Production-ready deployment

Happy blurring! 🙈

---

## 📎 Appendix: Automated SSL Setup Script

The `setup-ssl-blurthatguy.sh` script is included in your project root. Here's what it does:

**Script Location:** `~/blurthatguy/setup-ssl-blurthatguy.sh`

**Quick Usage:**
```bash
cd ~/blurthatguy
chmod +x setup-ssl-blurthatguy.sh
./setup-ssl-blurthatguy.sh
```

**Full Script Contents:**

```bash
#!/bin/bash
# BlurThatGuy.no - Quick SSL Setup Script
# Run this after Docker containers are running

set -e

echo "======================================"
echo "BlurThatGuy.no SSL Setup"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Please run this script as ubuntu user, not root"
    echo "Usage: ./setup-ssl-blurthatguy.sh"
    exit 1
fi

# Check if Docker containers are running
if ! docker ps | grep -q blurthatguy; then
    echo "❌ Docker containers are not running!"
    echo "Please start them first:"
    echo "  cd ~/blurthatguy"
    echo "  docker-compose -f docker-compose.prod.yml up -d"
    exit 1
fi

echo "Step 1: Installing Nginx and Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

echo ""
echo "Step 2: Creating Nginx configuration..."
sudo tee /etc/nginx/sites-available/blurthatguy > /dev/null <<'NGINX_EOF'
server {
    listen 80;
    server_name blurthatguy.no www.blurthatguy.no;
    
    client_max_body_size 100M;
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
NGINX_EOF

echo ""
echo "Step 3: Enabling Nginx configuration..."
sudo ln -sf /etc/nginx/sites-available/blurthatguy /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo ""
echo "Step 4: Testing Nginx configuration..."
sudo nginx -t

if [ $? -ne 0 ]; then
    echo "❌ Nginx configuration test failed!"
    exit 1
fi

echo ""
echo "Step 5: Restarting Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "Step 6: Checking DNS configuration..."
SERVER_IP=$(curl -s ifconfig.me)
DNS_IP=$(dig +short blurthatguy.no | tail -n1)

echo "Your server IP: $SERVER_IP"
echo "blurthatguy.no points to: $DNS_IP"

if [ "$SERVER_IP" != "$DNS_IP" ]; then
    echo ""
    echo "⚠️  WARNING: DNS is not pointing to this server yet!"
    echo ""
    echo "Please configure your DNS:"
    echo "1. Go to your domain registrar"
    echo "2. Add A records pointing to: $SERVER_IP"
    echo "3. Wait 5-10 minutes for DNS propagation"
    echo ""
    echo "Then run: sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no"
    echo ""
    exit 0
fi

echo ""
echo "✅ DNS is correctly configured!"
echo ""
read -p "Ready to get SSL certificate? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping SSL setup. Run it later with:"
    echo "  sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no"
    exit 0
fi

echo ""
echo "Step 7: Getting SSL certificate..."
sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "✅ SUCCESS!"
    echo "======================================"
    echo ""
    echo "Your app is now live at:"
    echo "  🔒 https://blurthatguy.no"
    echo "  🔒 https://www.blurthatguy.no"
    echo ""
    echo "SSL certificates will auto-renew every 90 days"
    echo "======================================"
else
    echo ""
    echo "❌ SSL certificate setup failed!"
fi
```

**To use this script:**

1. **Create the script on EC2:**
   ```bash
   nano ~/setup-ssl-blurthatguy.sh
   # Paste the script above
   ```

2. **Make it executable:**
   ```bash
   chmod +x ~/setup-ssl-blurthatguy.sh
   ```

3. **Run it:**
   ```bash
   ./setup-ssl-blurthatguy.sh
   ```

---

*Last updated: February 2026*