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
    echo "Usage: ./setup-ssl.sh"
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
sudo tee /etc/nginx/sites-available/blurthatguy > /dev/null <<'EOF'
server {
    listen 80;
    server_name blurthatguy.no www.blurthatguy.no;
    
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
EOF

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
echo "Step 6: Updating backend CORS settings..."
sudo tee /etc/blurthatguy.env > /dev/null <<'EOF'
# BlurThatGuy Production Environment

# API Key - CHANGE THIS!
API_KEY=PLEASE_CHANGE_THIS_KEY

# CORS - blurthatguy.no domain
ALLOWED_ORIGINS=http://blurthatguy.no,https://blurthatguy.no,http://www.blurthatguy.no,https://www.blurthatguy.no

# Upload limits
MAX_UPLOAD_SIZE_MB=100

# Production mode
DEV_MODE=false
EOF

echo ""
echo "⚠️  IMPORTANT: Edit /etc/blurthatguy.env and set a secure API_KEY!"
echo "Generate one with: openssl rand -hex 32"
echo ""
read -p "Press Enter after you've updated the API_KEY..."

echo ""
echo "Step 7: Restarting Docker containers..."
cd ~/blurthatguy
docker-compose -f docker-compose.prod.yml restart

echo ""
echo "Step 8: Checking if DNS is pointed to this server..."
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
    echo "2. Add an A record:"
    echo "   - Host: @"
    echo "   - Points to: $SERVER_IP"
    echo "   - TTL: 3600"
    echo "3. Add another A record for www:"
    echo "   - Host: www"
    echo "   - Points to: $SERVER_IP"
    echo "   - TTL: 3600"
    echo ""
    echo "Wait 5-10 minutes for DNS propagation, then run:"
    echo "  sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no"
    echo ""
    exit 0
fi

echo ""
echo "✅ DNS is correctly configured!"
echo ""
read -p "Ready to get SSL certificate? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping SSL setup. You can run it later with:"
    echo "  sudo certbot --nginx -d blurthatguy.no -d www.blurthatguy.no"
    exit 0
fi

echo ""
echo "Step 9: Getting SSL certificate with Let's Encrypt..."
echo ""
echo "You'll need to enter your email address and agree to the terms."
echo ""

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
    echo "Next steps:"
    echo "1. Update .env.production with your API_KEY"
    echo "2. Test the site in your browser"
    echo "3. Close ports 3000 and 8000 in AWS Security Group"
    echo ""
    echo "SSL certificates will auto-renew every 90 days"
    echo "======================================"
else
    echo ""
    echo "❌ SSL certificate setup failed!"
    echo "Check the error messages above and try again."
fi
