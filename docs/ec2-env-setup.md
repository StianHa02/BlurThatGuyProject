# EC2 Environment Setup

The `.env.prod` file is not committed to git. It must be created manually on each EC2 node before the first deploy.

---

## Why env vars work differently in Docker

Locally, Next.js reads `.env.local` automatically and Python reads `backend/.env.local` via dotenv — the files are just there on disk.

On EC2, the server only has what `git pull` gives it. `.env.local` is gitignored and never present. Docker containers are also isolated from the host filesystem, so env vars must be explicitly injected:

- **`NEXT_PUBLIC_*` vars** — baked into the JS bundle at build time. Passed as Docker build args from `.env.prod`.
- **Runtime vars** (`API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AWS_*`, etc.) — injected into the running container via `env_file: .env.prod` in `docker-compose.prod.yml`.

---

## Setup

SSH into the EC2 node, then:

```bash
cd ~/BlurThatGuyProject

# Copy the example file
cp .env.example .env.prod

# Edit and fill in all values
nano .env.prod

# Restrict permissions — this file contains secrets
chmod 600 .env.prod
```

Repeat on each node.

---

## Variables

### Frontend — build-time (`NEXT_PUBLIC_*`)

These are inlined into the JS bundle during `docker compose up --build`. Changing them requires a rebuild.

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Public URL of the frontend host (e.g. `https://blurthatguy.no`). Used by the browser to call the Next.js API proxy. Leave blank to use relative URLs. |
| `NEXT_PUBLIC_USER_INTEGRATION` | `1` to enable auth + My Videos. `0` for anonymous public tool. |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key. Safe to expose. |

### Frontend — runtime (server-side only, never sent to browser)

| Variable | Description |
|---|---|
| `API_URL` | Backend URL inside the Docker network. Always `http://backend:8000`. |
| `API_KEY` | Shared secret between frontend and backend. Must match the backend value. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. Bypasses RLS — keep secret. |
| `AWS_ACCESS_KEY_ID` | IAM user access key for S3. |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key for S3. |
| `AWS_REGION` | S3 bucket region (e.g. `eu-north-1`). |
| `AWS_S3_BUCKET_NAME` | S3 bucket name (e.g. `blurthatguy-videos`). |

### Backend — runtime

| Variable | Description |
|---|---|
| `API_KEY` | Same value as frontend `API_KEY`. |
| `ALLOWED_ORIGINS` | CORS origin for the frontend (e.g. `https://blurthatguy.no`). |
| `REDIS_URL` | Always `redis://redis:6379` in Docker. |
| `MAX_UPLOAD_SIZE_MB` | Optional. Limit video upload size in MB. Omit for no limit. |
| `TOTAL_THREAD_BUDGET` | Optional. Override ONNX thread count on high-core servers (e.g. `28`). |

---

## After setup

The CD pipeline (`cd.yml`) runs `docker compose -f docker-compose.prod.yml up -d --build` on every push to `main`. As long as `.env.prod` exists on the node, deploys are fully automatic.

To manually deploy or restart:

```bash
cd ~/BlurThatGuyProject
docker compose -f docker-compose.prod.yml up -d --build
```
