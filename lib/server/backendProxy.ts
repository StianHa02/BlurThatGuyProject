// lib/server/backendProxy.ts
// Shared server-side helper for all Next.js API proxy routes.
// Keeps API_URL and API_KEY in one place.

export const BACKEND_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || '';

/** Returns headers with X-API-Key injected if configured. */
export function backendHeaders(extra: HeadersInit = {}): HeadersInit {
  return API_KEY
    ? { ...extra, 'X-API-Key': API_KEY }
    : { ...extra };
}