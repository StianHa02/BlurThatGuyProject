// app/api/upload-video/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const response = await fetch(`${BACKEND_URL}/upload-video`, {
      method: 'POST',
      headers: backendHeaders(),
      body: formData,
    });
    const data = await response.json().catch(() => ({ detail: 'Upload failed' }));
    if (!response.ok) return NextResponse.json({ error: data.detail || 'Upload failed' }, { status: response.status });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload video' }, { status: 500 });
  }
}