# Security Audit Report

## Scope
Full codebase: Python backend, Next.js API routes, frontend pages, lib layer, S3 integration.

## Already Secure (no action needed)

The backend has solid fundamentals:
- **Path traversal protected**: `config.py:36,45-48` has `UUID_PATTERN` regex and `validate_video_id()` on all video endpoints
- **File upload validated**: `config.py:56-62` checks extensions and MIME types
- **API key enforced in production**: `config.py:88-93` raises `RuntimeError` if `API_KEY` missing and not `DEV_MODE`
- **Security headers**: `main.py:157-169` adds `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, HSTS
- **CORS locked down**: `config.py:99-106` explicit origins only, wildcards rejected
- **Subprocess safe**: All `subprocess` calls use list args (no `shell=True`), parameters validated by Pydantic models
- **No SQL anywhere**: Backend uses Redis + in-memory dicts. Frontend uses Supabase client (parameterized via PostgREST)
- **Anonymous usage by design**: Upload/detect/export endpoints are intentionally public when `USER_INTEGRATION=0`

## Fixed This Session

| Issue | Severity | File | Fix |
|---|---|---|---|
| S3 key spoofing in save | Critical | `app/api/videos/save/route.ts` | Added `videos/{userId}/` prefix validation |
| S3 key from client in delete | Critical | `app/api/videos/delete/route.ts` | Read `s3_key` from DB record, not request body |
| Bucket cap bypassed RLS | Medium | `app/api/videos/presign/route.ts` | Use admin client for global sum |
| S3 orphans on account delete | Medium | `app/api/user/delete/route.ts` | Delete all S3 objects before removing user |

## Remaining Recommendations

### 1. Validate videoId/jobId in frontend proxy routes (Low)
Backend already validates UUID format, but defense-in-depth says validate before proxying too.

**Files:**
- `app/api/detect-video/[videoId]/route.ts`
- `app/api/export/[videoId]/route.ts`
- `app/api/download/[videoId]/route.ts`
- `app/api/job/[jobId]/status/route.ts`
- `app/api/job/[jobId]/result/route.ts`
- `app/api/job/[jobId]/cancel/route.ts`

**Fix:** Add a shared UUID check helper, reject non-UUID values with 400 before forwarding to backend.

### 2. Sanitize filename in presign route (Low)
`app/api/videos/presign/route.ts:87` -- filename from client goes into S3 key. The UUID prefix prevents path traversal, but weird characters (unicode, control chars) could cause issues.

**Fix:** Strip to `[a-zA-Z0-9._-]` or reject invalid filenames.

### 3. Validate contentType in presign route (Low)
`app/api/videos/presign/route.ts:94` -- any MIME type accepted for S3 pre-signed URL.

**Fix:** Whitelist `['video/mp4', 'video/webm', 'video/quicktime']`.

### 4. Sanitize error messages in frontend proxy routes (Low)
Several proxy routes forward `error.detail` from the backend to the client. Could leak internal paths or library details on unexpected errors.

**Files:** `detect-video`, `export`, `download`, `job/*` route handlers.

**Fix:** Return generic messages ("Detection failed", "Export failed") and log the real error server-side.

### 5. Add Content-Security-Policy header (Medium)
No CSP configured in `next.config.ts`. CSP prevents XSS by restricting script sources.

**Fix:** Add `headers()` config in `next.config.ts` with a restrictive CSP policy.

## Not Issues (false positives from automated scan)

- "Command injection via subprocess" -- subprocess list args are safe, all params validated by Pydantic
- "Incomplete API key validation" -- `validate_environment()` already enforces API_KEY in production
- "SSRF via videoId" -- backend validates UUID format; Next.js URL-encodes path segments
- "Missing auth on upload/detect/export" -- anonymous usage is by design when user integration is off
- "Health endpoint public" -- by design, standard practice
- "Blob URL leak" -- memory management, not a security issue
- "Signed URL exposure in DOM" -- signed URLs are per-user, 1-hour TTL, this is how pre-signed URLs work

## Verification
- Attempt S3 key spoofing via save/delete endpoints (should be blocked by fixes already applied)
- Confirm bucket cap works across users (test with admin query)
- Confirm account deletion cleans up S3 objects
