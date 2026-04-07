# User Integration Setup

User integration is an optional feature that adds authentication, personal video storage, and editable projects to BlurThatGuy. When disabled (`NEXT_PUBLIC_USER_INTEGRATION=0`), the app works as a public standalone tool with no accounts required.

---

## Overview

| Feature | Description |
|---|---|
| Sign up / Sign in | Email + password via Supabase Auth |
| Username | Set at signup, shown in the navbar |
| My Projects | Save original videos + face tracks for re-editing later |
| Re-edit | Re-open a saved project, pick different faces to blur, download |
| My Videos | Library of legacy saved blurred videos |
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
   - This ensures the email matches the app's dark-mode branding and includes the logo

### 1.4 Run the Database Migration

Go to **SQL Editor** in the Supabase dashboard and run:

```sql
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  filename        TEXT NOT NULL,
  original_s3_key TEXT NOT NULL,
  tracks_s3_key   TEXT NOT NULL,
  fps             FLOAT NOT NULL,
  frame_count     INT NOT NULL,
  width           INT,
  height          INT,
  sample_rate     INT NOT NULL DEFAULT 3,
  track_count     INT NOT NULL DEFAULT 0,
  file_size       BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Part 2 — AWS S3

### 2.1 Create the Bucket

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/s3/) → **Create bucket**
2. Name it (e.g. `blurthatguy-videos`), select your region (`eu-north-1` for Stockholm)
3. **Keep "Block all public access" on** — the bucket is private
4. Click **Create bucket**

### 2.2 Configure CORS

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

This is required because the browser uploads directly to S3 via pre-signed URLs.

### 2.3 Create an IAM User

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


## Part 3 — Environment Variables

> If deploying, use docker-compose.dev.yml instead of docker-compose.yml.
> 
Add all of the following to `.env.local` (also exists in `.env.example`):

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
| `/signup` | Create account with username |
| `/my-projects` | Saved projects — re-edit or delete |
| `/settings` | Change password, delete account |
