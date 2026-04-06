# Projects Feature — Setup Guide

This guide covers what you need to change in Supabase and AWS to enable the Projects feature (save original video + face tracks for re-editing).

---

## Supabase

### Run this SQL in the Supabase dashboard SQL editor

Go to **SQL Editor** in your Supabase project and run:

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

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their projects"
  ON projects FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

That's it for Supabase. No new env vars required.

---

## AWS S3

**No changes needed.**

The existing IAM policy uses `"Resource": "arn:aws:s3:::YOUR_BUCKET/*"` — the wildcard already covers the new `projects/` prefix. CORS is already configured for `PUT` and `GET`. No new buckets or credentials are required.

> **Verify:** In your IAM policy, check that the `Resource` ends with `/*` and not something like `/videos/*`. If it is scoped to `videos/*`, add `arn:aws:s3:::YOUR_BUCKET/projects/*` as a second resource.

---

## New S3 Key Patterns

Projects are stored under a separate prefix from saved blurred videos:

| Type | S3 key pattern |
|------|----------------|
| Original video | `projects/{userId}/{uuid}-{filename}` |
| Face tracks JSON | `projects/{userId}/{uuid}-{filename}-tracks.json` |
| Blurred video (existing) | `videos/{userId}/{uuid}-{filename}` |

---

## What Changes in the App

| Feature | Before | After |
|---------|--------|-------|
| Save button | Saved blurred output | Saves original + tracks |
| My Videos dropdown | My Videos | My Projects |
| Re-edit | Not available | Re-edit from My Projects → jumps to select step |
| Storage quota | Counts `videos` table | Counts `projects` table |
| Account deletion | Deletes S3 videos | Deletes S3 project files |
