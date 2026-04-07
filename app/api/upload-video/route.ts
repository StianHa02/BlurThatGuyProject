/* Proxies a multipart video upload to the backend. Expects a multipart/form-data body. */
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';
import { requireAuth } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const formData = await request.formData();
    const response = await fetch(`${BACKEND_URL}/upload-video`, {
      method: 'POST',
      headers: backendHeaders(),
      body: formData,
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json().catch(() => ({ detail: 'Upload failed' }));
    if (!response.ok) return NextResponse.json({ error: data.detail || 'Upload failed' }, { status: response.status });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload video' }, { status: 500 });
  }
}
