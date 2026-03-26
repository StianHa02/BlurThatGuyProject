# User Integration Setup

User integration is an optional feature that adds authentication and personal video storage to BlurThatGuy. When disabled (`NEXT_PUBLIC_USER_INTEGRATION=0`), the app works as a public standalone tool with no accounts required.

---

## Overview

| Feature | Description |
|---|---|
| Sign up / Sign in | Email + password via Supabase Auth |
| Username | Set at signup, shown in the navbar |
| My Videos | Personal library of saved processed videos |
| Save Video | Upload processed videos to private S3 storage |
| Settings | Change password, delete account |

---

## Prerequisites

- A [Supabase](https://supabase.com) project
- An [AWS](https://aws.amazon.com) account with S3 access

---

## Part 1 — Supabase

### 1.1 Create a Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**, choose a name, region, and database password
3. Wait ~1 minute for provisioning

### 1.2 Get API Keys

Go to **Project Settings → API** and copy:

| Key | Dashboard label | Used in |
|---|---|---|
| Project URL | Project URL | `.env.local` |
| Publishable Key | Publishable Key (formerly "anon key") | `.env.local` |
| Secret Key | `service_role` | `.env.local` (server only — never expose) |

> The Publishable Key and anon key are the same key — Supabase renamed it. The env var stays `NEXT_PUBLIC_SUPABASE_ANON_KEY` because that is what `@supabase/ssr` expects.

### 1.3 Configure Auth

1. Go to **Authentication → Providers** — confirm **Email** is enabled (default)
2. Go to **Authentication → Settings**:
   - Set **Site URL** to your domain (e.g. `https://blurthatguy.no`)
   - Add `http://localhost:3000` to **Redirect URLs** for local development
   - Optionally disable **Confirm email** during development
3. **Custom Email Branding:**
   - Go to **Authentication → Email Templates**
   - Copy the content of `docs/email-templates/confirmation.html` into the **Confirm signup** template
   - This ensures the email matches the app's dark-mode branding and includes the logo.

### 1.4 Run the Database Migration

Go to **SQL Editor** in the Supabase dashboard and run:

```sql
CREATE TABLE videos (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename     TEXT        NOT NULL,
  s3_key       TEXT        NOT NULL,
  file_size    BIGINT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own videos"
  ON videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own videos"
  ON videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos"
  ON videos FOR DELETE
  USING (auth.uid() = user_id);
```

---

## Part 2 — AWS S3

### 2.1 Security Model

| Threat | Mitigation |
|---|---|
| User A reads User B's video | Private bucket — videos served via signed URLs (1 hr TTL), owner-scoped |
| Upload to another user's path | Pre-signed PUT URLs generated server-side using the authenticated user's ID |
| Spam / abuse | 10 uploads per user per hour (enforced via DB row count) |
| Storage abuse | 5 GB per-user quota + 30 GB total bucket cap |
| Oversized files | 2 GB per-file limit checked before issuing the upload URL |

### 2.2 Create the Bucket

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/s3/) → **Create bucket**
2. Name it (e.g. `blurthatguy-videos`), select your region (`eu-north-1` for Stockholm)
3. **Keep "Block all public access" on** — the bucket is private
4. Click **Create bucket**

### 2.3 Configure CORS

Go to **Permissions → Cross-origin resource sharing (CORS)** and paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://blurthatguy.no"
    ],
    "ExposeHeaders": []
  }
]
```

This is required because the browser uploads directly to S3 via pre-signed URL.

### 2.4 Create an IAM User

1. Go to **IAM → Users → Create user** (e.g. `blurthatguy-app`)
2. **Attach policies directly → Create policy** — paste the following JSON, replacing the bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::blurthatguy-videos/*"
    }
  ]
}
```

3. Name the policy (e.g. `BlurThatGuyS3Policy`), create it, and attach it to the user
4. Go to the user → **Security credentials → Create access key → Application running outside AWS**
5. Copy the **Access key ID** and **Secret access key** — you won't see the secret again

### 2.5 Upload Flow

```
Browser → POST /api/videos/presign   auth + rate limit + quota checks
        ← { uploadUrl, key }          signed PUT URL (5 min TTL)
Browser → PUT {uploadUrl}             uploads blob directly to S3 (no server proxy)
Browser → POST /api/videos/save       stores s3_key + metadata in Supabase

Browser → GET  /api/videos            server generates fresh signed GET URLs
        ← [{ signedUrl, ... }]        1-hour expiring, owner-scoped
Browser    <video src={signedUrl}>    plays directly from S3
```

Videos are stored at: `s3://BUCKET/videos/{userId}/{uuid}-filename.mp4`

### 2.6 Storage Limits

All limits are constants at the top of `app/api/videos/presign/route.ts` and can be adjusted there.

| Limit | Default |
|---|---|
| Max file size per upload | 2 GB |
| Per-user storage quota | 5 GB |
| Total bucket cap | 30 GB |
| Rate limit | 10 uploads / user / hour |

---

## Part 3 — Environment Variables

Add all of the following to `.env.local`:

```bash
# Feature flag
NEXT_PUBLIC_USER_INTEGRATION=1

# Supabase — safe to expose in client code
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key

# Supabase — server only, never expose
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AWS — server only, never expose
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=eu-north-1
AWS_S3_BUCKET_NAME=blurthatguy-videos
```

---

## Routes

| Route | Description |
|---|---|
| `/login` | Sign in → redirects to home |
| `/signup` | Create account → email confirmation |
| `/my-videos` | Personal video library |
| `/settings` | Change password, delete account |
