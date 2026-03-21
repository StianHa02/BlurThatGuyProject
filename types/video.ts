export interface VideoRecord {
  id: string;
  filename: string;
  s3_key: string;
  file_size: number | null;
  created_at: string;
  signedUrl: string;
}
