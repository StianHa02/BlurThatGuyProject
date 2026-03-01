// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { BACKEND_URL, backendHeaders } from '@/lib/server/backendProxy';

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      headers: backendHeaders({ 'Content-Type': 'application/json' }),
    });
    if (!response.ok) return NextResponse.json({ error: 'Backend service unavailable' }, { status: response.status });
    return NextResponse.json(await response.json());
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json({ error: 'Failed to connect to backend service' }, { status: 503 });
  }
}