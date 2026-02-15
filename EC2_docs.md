# 🚀 EC2 Deployment Update Guide

Quick reference for updating your EC2 deployment with new code.

---

## 📤 Deploy New Changes

### Step 1: Push from Local Machine

**In PyCharm Terminal:**

```bash
# 1. Stage your changes
git add .

# 2. Commit with a meaningful message
git commit -m "Add batch detection optimization"

# 3. Push to GitHub
git push origin main
```

---

### Step 2: Update EC2

**SSH into your EC2 instance:**

```bash
ssh -i ~/Downloads/blurthatguy-key.pem ubuntu@13.61.41.5
```

**Pull and rebuild everything:**

```bash
# Navigate to project
cd /opt/blurthatguy/BlurThatGuyProject

# Pull latest code
git pull origin main

# Rebuild and restart containers
docker-compose down
docker-compose up -d --build

# Watch logs to verify
docker-compose logs -f
```

**Wait for these messages:**
```
frontend_1  | ✓ Ready in 66ms
backend_1   | Application startup complete.
```

Press `Ctrl+C` to exit logs.

**✅ Your changes are now live at:** http://13.61.41.5

---

## ⚡ Quick One-Liner

```bash
cd /opt/blurthatguy/BlurThatGuyProject && git pull && docker-compose down && docker-compose up -d --build && docker-compose logs -f
```

---

## 🎯 Partial Updates (Faster)

### Backend Only

If you only changed Python code:

```bash
cd /opt/blurthatguy/BlurThatGuyProject
git pull origin main
docker-compose up -d --build backend
docker-compose logs -f backend
```

### Frontend Only

If you only changed React/Next.js code:

```bash
cd /opt/blurthatguy/BlurThatGuyProject
git pull origin main
docker-compose up -d --build frontend
docker-compose logs -f frontend
```

---

## 🔍 Verify Deployment

```bash
# Check container status
docker-compose ps

# Should show:
# blurthatguyproject_frontend_1   Up   0.0.0.0:3000->3000/tcp
# blurthatguyproject_backend_1    Up   0.0.0.0:8000->8000/tcp

# Test backend health
curl http://localhost:8000/health

# Should return: {"status":"ok","model":"YuNet"}
```

**Open in browser:** http://13.61.41.5

---

## 🐛 Troubleshooting

### Build Fails

```bash
# Clean rebuild
docker-compose down
docker system prune -a  # Warning: removes all unused Docker data
docker-compose up -d --build
```

### Containers Won't Start

```bash
# Check logs for errors
docker-compose logs

# Restart individual service
docker-compose restart frontend
docker-compose restart backend
```

### Nginx Issues

```bash
# Check nginx status
sudo systemctl status nginx

# Reload nginx config
sudo nginx -t
sudo systemctl reload nginx

# View nginx error logs
sudo tail -50 /var/log/nginx/error.log
```

### Port Conflicts

```bash
# Check what's using port 3000
sudo lsof -i :3000

# Check what's using port 8000
sudo lsof -i :8000

# Kill process if needed
sudo kill -9 <PID>
```

---

## 📊 Monitoring

```bash
# Live logs (all services)
docker-compose logs -f

# Live logs (specific service)
docker-compose logs -f frontend
docker-compose logs -f backend

# Last 50 lines
docker-compose logs --tail=50

# System resource usage
docker stats
```

---

## 🔄 Rollback to Previous Version

```bash
# On EC2
cd /opt/blurthatguy/BlurThatGuyProject

# See commit history
git log --oneline -5

# Rollback to specific commit
git reset --hard <commit-hash>

# Rebuild
docker-compose down
docker-compose up -d --build
```

---

## 💾 Backup Before Major Changes

```bash
# On EC2
cd /opt/blurthatguy/BlurThatGuyProject

# Create a backup branch
git branch backup-$(date +%Y%m%d)

# Or take EC2 snapshot:
# AWS Console → EC2 → Snapshots → Create Snapshot
```

---

## 🔐 Update Environment Variables

If you need to change API keys or other env vars:

```bash
# Edit environment file
nano .env.prod

# Restart containers to pick up changes
docker-compose down
docker-compose up -d
```

---

## 📝 Quick Reference

| Task | Command |
|------|---------|
| Pull latest code | `git pull origin main` |
| Rebuild everything | `docker-compose up -d --build` |
| Restart services | `docker-compose restart` |
| Stop services | `docker-compose down` |
| View logs | `docker-compose logs -f` |
| Check status | `docker-compose ps` |
| Clean rebuild | `docker-compose down && docker system prune -a && docker-compose up -d --build` |

---

## 🚨 Emergency: Service Down

```bash
# Quick recovery
ssh -i ~/Downloads/blurthatguy-key.pem ubuntu@13.61.41.5
cd /opt/blurthatguy/BlurThatGuyProject
docker-compose down
docker-compose up -d
docker-compose logs -f
```

If still not working:
```bash
# Full rebuild
docker-compose down
docker system prune -a
docker-compose up -d --build
sudo systemctl restart nginx
```

---

Made by [stianha.com](https://stianha.com)