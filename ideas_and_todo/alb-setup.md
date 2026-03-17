# AWS ALB Setup — BlurThatGuy

## Files to change

Only one file needs touching. `main.py` already has `/health`.

---

### `nginx.conf` — paste this to `/etc/nginx/sites-available/blurthatguy`

ALB terminates TLS, so nginx only needs a single port 80 block. No 443, no certbot references.

```bash
sudo nano /etc/nginx/sites-available/blurthatguy
```

Paste this entire config (replaces existing):

```nginx
server {
    listen 80;
    server_name blurthatguy.no www.blurthatguy.no;

    client_max_body_size 0;       # no limit — FastAPI enforces MAX_UPLOAD_SIZE_MB
    proxy_read_timeout 900;
    proxy_connect_timeout 900;
    proxy_send_timeout 900;
    
    # Route health checks directly to the FastAPI backend
    location = /health {
        proxy_pass http://localhost:8000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

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

### Remove certbot from both EC2s

ALB handles TLS with an ACM cert that auto-renews forever. Certbot on the EC2 is now dead code and its renewal cron will fail since port 443 is no longer open on the instance.

```bash
# Stop and disable certbot renewal timer
sudo systemctl stop certbot.timer
sudo systemctl disable certbot.timer

# Remove certbot
sudo apt remove --purge certbot python3-certbot-nginx -y
sudo apt autoremove -y

# Remove leftover letsencrypt files (optional but clean)
sudo rm -rf /etc/letsencrypt
```

Do this on both EC2s after the ALB is live and verified.

---

## AWS Console walkthrough

### Step 1 — Security groups

Do this first — the groups reference each other.

**Create new ALB security group** (`sg-alb`)

| Type  | Protocol | Port | Source    |
|-------|----------|------|-----------|
| HTTPS | TCP      | 443  | 0.0.0.0/0 |
| HTTP  | TCP      | 80   | 0.0.0.0/0 |

**Update your existing EC2 security group** (`blurthatguy-sg`)

Remove ALL existing inbound rules except SSH. Then add:

| Type | Protocol | Port | Source                               |
|------|----------|------|--------------------------------------|
| HTTP | TCP      | 80   | sg-alb (select by security group ID) |
| SSH  | TCP      | 22   | your IP only                         |

This closes ports 3000, 8000, and 443 on the EC2. Only the ALB can reach port 80. Direct IP access is dropped at the firewall.

---

### Step 2 — ACM certificate

If you don't already have the cert in ACM (separate from your Let's Encrypt one):

1. Go to **ACM → Request certificate → Public certificate**
2. Enter `blurthatguy.no` and `www.blurthatguy.no`
3. Choose **DNS validation**
4. ACM shows you one or two CNAME records — copy the Name and Value for each

**Adding the validation CNAMEs in Cloudflare:**

1. Cloudflare dashboard → your domain → **DNS → Records → Add record**
2. For each record ACM gives you:

| Field | Value |
|-------|-------|
| Type | CNAME |
| Name | the subdomain ACM gives (e.g. `_a79865eb4cd1a6ab990a45779b4e0b96`) |
| Target | the value ACM gives (e.g. `_abc123.acm-validations.aws`) |
| Proxy status | **DNS only — grey cloud, NOT orange** |

3. Click **Save**

> The grey cloud is critical — if left orange (proxied), Cloudflare intercepts the request and ACM validation never completes.

5. Back in ACM wait 2–5 minutes — status changes to **Issued**

---

### Step 3 — Target group

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

### Step 4 — Load balancer

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

- HTTPS on port 443 → Forward to your target group → select the ACM cert for `blurthatguy.no`
- HTTP on port 80 → Redirect to HTTPS, port 443, status 301

**After creating**, set the idle timeout to match your proxy timeout:

ALB → your load balancer → **Attributes** → Edit → **Idle timeout: 900**

Click **Create load balancer**.

---

### Step 5 — DNS

Replace your current A record (pointing at the Elastic IP) with a CNAME to the ALB. Copy the ALB DNS name from the load balancer detail page:

```
blurthatguy.no      →  blurthatguy-alb-1234567890.eu-west-1.elb.amazonaws.com
www.blurthatguy.no  →  blurthatguy-alb-1234567890.eu-west-1.elb.amazonaws.com
```

> In Cloudflare, set both records to **DNS only (grey cloud, NOT orange)** — if proxied, Cloudflare will intercept traffic before it reaches the ALB and HTTPS will break.

> If your DNS provider supports ALIAS or ANAME records on the apex domain, use that instead of CNAME — some providers don't allow CNAME on the root.

---

## Verifying it works

Check health status:

```
EC2 → Target Groups → your group → Targets tab
```

Both instances should show **healthy** within ~60 seconds.

Test from terminal:

```bash
curl -I https://blurthatguy.no/health
# Should return HTTP/2 200
```

---

## Rollback

If anything goes wrong before DNS propagates, point the A records back at the Elastic IP. The EC2s and nginx are unchanged until you run the certbot removal step, so the original setup comes back instantly. Run the certbot removal only after the ALB is confirmed working.

---

## Further consideration — guaranteed priority routing

ALB LOR cannot guarantee user 1 always lands on the 32-core. When both nodes are at 0 in-flight it picks arbitrarily. If guaranteed priority matters, the only option is a custom router.

**How it works:**

```
User → ALB :443 → 2-core:9000 (router)
                      │
                      ├─ checks Redis queue depth on 32-core
                      │
                      ├─ depth == 0 → forward to 32-core:80
                      └─ depth  > 0 → forward to 2-core:80
```

ALB points at the router on the 2-core only (port 9000). The router checks the 32-core's Redis queue on every request. If the 32-core is free, the user goes there. If it is busy, the user stays on the 2-core. The 32-core never appears in the ALB target group — the router handles forwarding to it directly over the private VPC network.

This guarantees user 1 always hits the 32-core. The 2-core only receives traffic when the 32-core is genuinely busy.

Tradeoff: the 2-core becomes a single point of failure for routing. If it goes down, the router goes with it. Acceptable at this scale.

**Security group changes needed:**

2-core security group — add:

| Type | Protocol | Port | Source |
|------|----------|------|--------|
| Custom TCP | TCP | 9000 | sg-alb |

32-core security group — add:

| Type | Protocol | Port | Source |
|------|----------|------|--------|
| HTTP | TCP | 80 | sg-ec2-2core (2-core's security group) |

The 32-core only accepts traffic from the 2-core's router, not from the internet or ALB directly.

**File layout after implementation:**

```
Both EC2s (after git pull):
  backend/
    main.py             ← runs on both
    router.py           ← dormant on 32-core, active on 2-core
  docker-compose.yml        ← identical on both, no router service
  docker-compose.2core.yml  ← only used on 2-core, adds router service
```

**`docker-compose.2core.yml` would look like:**

```yaml
services:
  router:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "9000:9000"
    environment:
      NODE_32CORE: "http://10.0.1.10:80"   # 32-core private IP
      NODE_2CORE: "http://localhost:80"
      REDIS_32CORE: "redis://10.0.1.10:6379"
    command: uvicorn router:app --host 0.0.0.0 --port 9000
    restart: unless-stopped
```

**`router.py` would look roughly like:**

```python
import httpx, os
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import aioredis

app = FastAPI()
NODE_32CORE  = os.environ["NODE_32CORE"]
NODE_2CORE   = os.environ["NODE_2CORE"]
REDIS_32CORE = os.environ["REDIS_32CORE"]

async def queue_depth_32core() -> int:
    r = await aioredis.from_url(REDIS_32CORE)
    depth = await r.get("queue:depth")
    await r.close()
    return int(depth or 0)

async def pick_node() -> str:
    depth = await queue_depth_32core()
    return NODE_32CORE if depth == 0 else NODE_2CORE

@app.api_route("/{path:path}", methods=["GET","POST","PUT","DELETE"])
async def proxy(request: Request, path: str):
    target = await pick_node()
    async with httpx.AsyncClient(timeout=None) as client:
        resp = await client.request(
            method=request.method,
            url=f"{target}/{path}",
            headers=dict(request.headers),
            content=await request.body(),
        )
    return StreamingResponse(
        iter([resp.content]),
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )
```

**To start on each EC2:**

```bash
# 32-core — normal startup
docker compose up -d

# 2-core — activates router on port 9000
docker compose -f docker-compose.yml -f docker-compose.2core.yml up -d
```

**ALB target group change:** remove the 32-core from the target group entirely. Add only the 2-core on port 9000. The router handles all forwarding to the 32-core internally over the private VPC IP.

To implement fully, ask Claude: "Build the router.py and docker-compose.2core.yml for priority routing between the 32-core and 2-core EC2, using the Redis queue depth approach, including SSE streaming passthrough and the queue:depth publish in main.py."