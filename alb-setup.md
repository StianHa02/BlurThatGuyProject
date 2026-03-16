# AWS ALB Setup — BlurThatGuy

## Files to change

Only one file in your repo needs touching. `main.py` already has `/health`.

---

### `nginx.conf` — add SSE buffering to `/api/` location

Edit on EC2:
```bash
sudo nano /etc/nginx/sites-available/blurthatguy
```

Paste this entire config (replaces existing):

```nginx
server {
    listen 80;
    server_name blurthatguy.no www.blurthatguy.no;

    client_max_body_size 500M;
    proxy_read_timeout 900;
    proxy_connect_timeout 900;
    proxy_send_timeout 900;

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
        proxy_read_timeout 900;
        proxy_connect_timeout 900;
        proxy_send_timeout 900;

        # Required for SSE progress streaming through ALB
        proxy_buffering off;
        add_header X-Accel-Buffering no;
    }
}

server {
    listen 443 ssl;
    server_name blurthatguy.no www.blurthatguy.no;

    ssl_certificate /etc/letsencrypt/live/blurthatguy.no/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blurthatguy.no/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 500M;
    proxy_read_timeout 900;
    proxy_connect_timeout 900;
    proxy_send_timeout 900;

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
        proxy_read_timeout 900;
        proxy_connect_timeout 900;
        proxy_send_timeout 900;

        # Required for SSE progress streaming through ALB
        proxy_buffering off;
        add_header X-Accel-Buffering no;
    }
}
```

Then reload:
```bash
sudo nginx -t && sudo nginx -s reload
```

---

## AWS Console walkthrough

### Step 1 — Security groups

You need two security groups. Do this first because they reference each other.

**Create new ALB security group** (`sg-alb`)

| Type  | Protocol | Port | Source    |
|-------|----------|------|-----------|
| HTTPS | TCP      | 443  | 0.0.0.0/0 |
| HTTP  | TCP      | 80   | 0.0.0.0/0 |

**Update your existing EC2 security group** (`blurthatguy-sg`)

Remove the existing port 80/443 open-to-world rules. Replace with:

| Type  | Protocol | Port | Source                               |
|-------|----------|------|--------------------------------------|
| HTTP  | TCP      | 80   | sg-alb (select by security group ID) |
| SSH   | TCP      | 22   | your IP only                         |

This ensures only the ALB can reach your EC2s on port 80. Direct IP access is dropped at the firewall.

---

### Step 2 — Target group

EC2 → Load Balancing → Target Groups → **Create target group**

| Field | Value |
|-------|-------|
| Target type | Instances |
| Protocol | HTTP |
| Port | 80 |
| VPC | your existing VPC |
| Protocol version | HTTP1 |
| **Load balancing algorithm** | **Least outstanding requests** |

**Health check settings:**

| Field | Value |
|-------|-------|
| Protocol | HTTP |
| Path | `/health` |
| Healthy threshold | 2 |
| Unhealthy threshold | 2 |
| Timeout | 5 seconds |
| Interval | 30 seconds |
| Success codes | 200 |

Click **Next**, select both EC2 instances, click **Include as pending below**, then **Create target group**.

---

### Step 3 — Load balancer

EC2 → Load Balancing → Load Balancers → **Create load balancer** → **Application Load Balancer**

| Field | Value |
|-------|-------|
| Name | blurthatguy-alb |
| Scheme | Internet-facing |
| IP address type | IPv4 |
| VPC | your existing VPC |
| Subnets | select at least 2 AZs (both where your EC2s live) |
| Security groups | sg-alb (created above) |

**Listeners:**

- HTTPS on port 443 → Forward to your target group → select your existing ACM cert for `blurthatguy.no`
- HTTP on port 80 → Redirect to HTTPS, port 443, status 301

Click **Create load balancer**.

---

### Step 4 — DNS

You currently point `blurthatguy.no` at an Elastic IP. Replace that A record with a CNAME pointing at the ALB DNS name (copy it from the load balancer detail page):

```
blurthatguy.no      →  blurthatguy-alb-1234567890.eu-west-1.elb.amazonaws.com
www.blurthatguy.no  →  blurthatguy-alb-1234567890.eu-west-1.elb.amazonaws.com
```

> If your DNS provider supports ALIAS or ANAME records on the apex domain, use that instead of CNAME — some providers don't allow CNAME on the root.

Your certbot certs remain valid. ALB terminates TLS using the ACM cert, so Let's Encrypt on the EC2 is no longer in the traffic path — but leave certbot running so the certs auto-renew harmlessly.

---

## Verifying it works

Check health status in the console:

```
EC2 → Target Groups → your group → Targets tab
```

Both instances should show **healthy** within ~60 seconds.

Test from the terminal:

```bash
curl -I https://blurthatguy.no/health
# Should return HTTP/2 200
```

---

## Rollback

DNS currently points at your Elastic IP. If anything goes wrong, point the A record back at the Elastic IP. The EC2s and nginx are unchanged so the original setup comes back instantly.