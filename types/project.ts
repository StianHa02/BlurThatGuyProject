export interface ProjectRecord {
  id: string;
  filename: string;
  original_s3_key: string;
  tracks_s3_key: string;
  fps: number;
  frame_count: number;
  width: number | null;
  height: number | null;
  sample_rate: number;
  track_count: number;
  file_size: number | null;
  created_at: string;
  originalSignedUrl: string;  // injected by GET /api/projects
  tracksSignedUrl: string;    // injected by GET /api/projects
}
