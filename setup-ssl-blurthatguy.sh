#!/bin/bash
# BlurThatGuy.no - SSL Setup Script
# Run this after Docker containers are running

set -e

echo "======================================"
echo "BlurThatGuy.no SSL Setup"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Please run this script as ubuntu user, not root"
    exit 1
fi

# Check if Docker containers are running
if ! docker ps | grep -q blurthatguy; then
    echo "❌ Docker containers are not running!"
    echo "Please start them first:"
    echo "  cd ~/BlurThatGuyProject"
    echo "  docker-compose up -d"
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
echo "Step 5: Starting Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "Step 6: Writing backend environment..."
sudo tee /etc/blurthatguy.env > /dev/null <<'ENV_EOF'
# BlurThatGuy Environment

API_KEY=
DEV_MODE=true
ALLOWED_ORIGINS=http://blurthatguy.no,https://blurthatguy.no,http://www.blurthatguy.no,https://www.blurthatguy.no
MAX_UPLOAD_SIZE_MB=100
ENV_EOF

echo ""
echo "Step 7: Restarting Docker containers..."
cd ~/BlurThatGuyProject
docker-compose restart

echo ""
echo "Step 8: Checking DNS..."
SERVER_IP=$(curl -s ifconfig.me)
DNS_IP=$(dig +short blurthatguy.no | tail -n1)

echo "Your server IP : $SERVER_IP"
echo "blurthatguy.no : $DNS_IP"

if [ "$SERVER_IP" != "$DNS_IP" ]; then
    echo ""
    echo "⚠️  DNS is not pointing to this server yet!"
    echo "Make sure your Cloudflare A records (grey cloud) point to: $SERVER_IP"
    echo ""
    echo "Once DNS is correct, run:"
    echo "  sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no"
    echo ""
    exit 0
fi

echo ""
echo "✅ DNS is correctly configured!"
echo ""
read -p "Get SSL certificate now? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Run SSL setup later with:"
    echo "  sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no"
    exit 0
fi

echo ""
echo "Step 9: Getting SSL certificate..."
sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "✅ SUCCESS!"
    echo "======================================"
    echo ""
    echo "  🔒 https://blurthatguy.no"
    echo "  🔒 https://www.blurthatguy.no"
    echo ""
    echo "SSL auto-renews every 90 days."
    echo "======================================"
else
    echo ""
    echo "❌ SSL setup failed - check errors above."
fi