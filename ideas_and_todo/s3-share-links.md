# S3 Share Links — BlurThatGuy

## Philosophy — privacy by default

Journalists handling source footage have a threat model beyond URL leaks — it includes legal requests to AWS, data breaches, and corporate proxies. The right default is:

> Processed video never leaves the EC2. Downloaded once, deleted immediately.

S3 is opt-in, triggered only when the journalist explicitly wants to share output with an editor.

---

## Default flow — unchanged

```
Upload → process → /download/{video_id} → file served from EC2 → deleted on cleanup
```

`/download/{video_id}` already returns a `FileResponse` straight off disk. No S3, no cloud storage, footage stays on the machine that processed it. **No code change needed.**

---

## Share link flow

Journalist clicks "Generate share link" after export completes.

```
POST /job/{job_id}/share
  → upload _blurred.mp4 to S3 (private bucket)
  → store one-time token in Redis: token → s3_key, expires in 10 min
  → return https://blurthatguy.no/share/{token}

GET /share/{token}
  → look up token in Redis
  → if expired or already used → 403
  → mark token as used immediately
  → stream file from S3 to browser
  → delete from S3 after stream completes
```

File gone after one download. Token gone after expiry. No permanent cloud storage of source footage.

---

## Code changes

### `main.py` — 2 new endpoints, ~50 lines, nothing existing touched

```python
import boto3
from secrets import token_urlsafe

s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "eu-north-1"))
SHARE_BUCKET = os.environ.get("SHARE_BUCKET", "blurthatguy-shares")
SHARE_TTL = 600  # 10 minutes


@app.post("/job/{job_id}/share")
async def create_share_link(job_id: str, request: Request, _: bool = Depends(verify_api_key)):
    output_path = get_safe_video_path(job_id, "_blurred.mp4")
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Export first before sharing.")

    share_token = token_urlsafe(32)
    s3_key = f"shares/{job_id}/{share_token}.mp4"
    s3.upload_file(str(output_path), SHARE_BUCKET, s3_key)

    redis = _get_redis_client(request)
    redis.setex(f"share:{share_token}", SHARE_TTL, s3_key)

    return {"shareUrl": f"/share/{share_token}", "expiresIn": SHARE_TTL}


@app.get("/share/{token}")
async def download_share(token: str, request: Request):
    redis = _get_redis_client(request)
    s3_key = redis.get(f"share:{token}")

    if not s3_key:
        raise HTTPException(status_code=403, detail="Link expired or already used.")

    # Mark used immediately — one download only
    redis.delete(f"share:{token}")

    s3_obj = s3.get_object(Bucket=SHARE_BUCKET, Key=s3_key)

    async def stream():
        for chunk in s3_obj["Body"].iter_chunks(chunk_size=1024 * 256):
            yield chunk
        # Clean up S3 after stream completes
        s3.delete_object(Bucket=SHARE_BUCKET, Key=s3_key)

    return StreamingResponse(
        stream(),
        media_type="video/mp4",
        headers={"Content-Disposition": "attachment; filename=blurred-video.mp4"},
    )
```

### `docker-compose.yml` — add env vars

```yaml
environment:
  SHARE_BUCKET: blurthatguy-shares
  AWS_REGION: eu-north-1
```

### Frontend — one new button

Add a "Generate share link" button in the export complete state. Calls `POST /job/{job_id}/share`, displays the returned URL with a copy button and expiry countdown. One component change, no new pages.

---

## AWS setup

**S3 bucket:**
1. Create private bucket `blurthatguy-shares` in `eu-north-1`
2. Block all public access — on
3. Add lifecycle rule: delete objects older than 1 hour (safety net in case stream fails mid-way)

**IAM role on EC2:**

Attach an inline policy to the EC2 instance role — scoped to this bucket only:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::blurthatguy-shares/*"
}
```

No access keys needed — the instance role handles auth automatically via boto3.

---

## CloudFront (optional, console only)

Once S3 is in place, point a CloudFront distribution at the share bucket with Origin Access Control. Downloads then serve from the AWS edge node closest to the recipient. No code change — the `/share/{token}` endpoint already streams the file; CloudFront just makes it faster globally.

---

## Summary

| What changes | Effort |
|---|---|
| `main.py` | +50 lines, 2 new endpoints |
| `docker-compose.yml` | +2 env vars |
| Frontend | 1 new button + copy UI |
| AWS | S3 bucket + IAM role (console only) |
| Existing endpoints | Untouched |
