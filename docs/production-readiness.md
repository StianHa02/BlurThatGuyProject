# BlurThatGuy — Production Readiness Report & Improvement Plan

## Context

This report assesses the BlurThatGuy codebase — a full-stack video processing app (Next.js 16 + FastAPI) that detects, tracks, and blurs faces in videos. The goal is to identify gaps between the current state and a production-ready product, then provide a prioritized improvement plan.

---

## Overall Rating: **7 / 10 — Beta-Ready**

The codebase is well-architected with modern tooling, clean TypeScript, and solid Docker/CI-CD infrastructure. The main gaps are in testing, monitoring, accessibility, and SEO.

| Category | Score | Notes |
|----------|-------|-------|
| Architecture & Code Quality | 9/10 | Clean separation, strict TS, good hooks |
| TypeScript & Type Safety | 9/10 | Strict mode, no `any`, well-organized types |
| Documentation | 8/10 | Excellent README + deployment docs |
| CI/CD & Deployment | 8/10 | Multi-stage Docker, GitHub Actions CI+CD |
| Security | 7/10 | Good auth/CORS/headers, missing CSP + rate limiting |
| Error Handling | 7/10 | Good try/catch + user messages, no error boundary |
| Performance | 7/10 | Caching on models, minimal code splitting |
| Infrastructure Resilience | 6/10 | Redis in-memory only, no health monitoring |
| Accessibility | 4/10 | Reduced motion support, but missing ARIA labels |
| SEO | 3/10 | Basic title/description only |
| Monitoring & Observability | 3/10 | Basic console logging, no error tracking |
| Testing | 1/10 | No tests at all |

---

## Detailed Findings

### Strengths

- **TypeScript**: Strict mode enabled, zero `any` types, well-organized `/types` directory with proper interfaces
- **Component design**: Small, focused components following single responsibility. Good use of custom hooks (`useVideoUpload`, `useFaceDetection`, `useVideoExport`)
- **API architecture**: Secure proxy pattern — frontend API routes forward to backend with server-side API key, keeping secrets off the client
- **Security fundamentals**: API key auth, CORS whitelist (no wildcards), security headers (X-Frame-Options, HSTS, X-Content-Type-Options), pre-signed S3 URLs with TTL
- **Docker**: Multi-stage builds, non-root user, standalone Next.js output
- **CI pipeline**: 4 jobs (lint, backend health, frontend health, smoke build) with concurrency control
- **Documentation**: 19KB README, deployment guide, user integration guide, EC2 setup guide
- **Secrets management**: `.env` files properly gitignored, never committed to history

---

### Issues Found

#### Critical Priority

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **Zero test coverage** | Entire project | Bugs reach production untested. No safety net for refactoring |
| 2 | **No error tracking** | Frontend + Backend | Production errors go unnoticed until users report them |

#### High Priority

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 3 | **No React Error Boundary** | Frontend | Unhandled errors crash the entire app |
| 4 | **No CSP headers** on frontend | `next.config.ts` or middleware | XSS attack surface |
| 5 | **No rate limiting** on detect/export endpoints | Backend API | Abuse potential on CPU-heavy endpoints |
| 6 | **Redis has no persistence** | `docker-compose.yml` (`--save "" --appendonly no`) | Job queue lost on restart |
| 7 | **DEV_MODE bypass** | `backend/config.py` | If accidentally set in prod, auth is disabled |

#### Medium Priority

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 8 | Missing ARIA labels on interactive elements | `FaceGallery`, `UserDropdown` | Poor screen reader experience |
| 9 | No Open Graph / social meta tags | `app/layout.tsx` | Poor link previews on social media |
| 10 | No `robots.txt` or `sitemap.xml` | `public/` | Poor search engine discoverability |
| 11 | Minimal code splitting | Upload page components | Larger initial bundle than necessary |
| 12 | No API response caching | GET endpoints | Unnecessary repeated fetches |
| 13 | No structured logging | Frontend + Backend | Hard to aggregate/search logs |

#### Low Priority

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 14 | No analytics | Frontend | No insight into user behavior |
| 15 | No database backup strategy documented | Supabase | Risk of data loss |
| 16 | No load testing | Infrastructure | Unknown breaking point |

---

## Improvement Plan

### Phase 1: Safety Net (Testing + Monitoring)

**Goal**: Catch bugs before users do

#### 1.1 Add testing infrastructure

- **Files to create**: `vitest.config.ts`, `playwright.config.ts`
- **Dependencies to add**: `vitest`, `@testing-library/react`, `@playwright/test`

**Unit tests** (Vitest):
- `lib/utils/format.ts` — pure functions, easy to test
- `lib/tracking/interpolation.ts` — critical algorithm
- `lib/config.ts` — environment variable parsing
- `lib/services/*.ts` — API service functions (mock fetch)
- Custom hooks: `useVideoUpload`, `useFaceDetection`, `useVideoExport`

**API route tests** (Vitest):
- `app/api/health/route.ts`
- `app/api/upload-video/route.ts`
- `app/api/detect-video/[videoId]/route.ts`
- `app/api/export/[videoId]/route.ts`
- `app/api/videos/*/route.ts` — presign, save, delete

**E2E tests** (Playwright):
- Landing page renders correctly
- Upload flow: file select -> upload -> detect -> select faces -> export
- Auth flow: signup -> login -> my videos (if user integration enabled)

**Backend tests** (pytest):
- `backend/auth.py` — API key validation
- `backend/config.py` — config parsing
- `backend/pipeline/` — face detection, tracking, ReID (with fixtures)
- `backend/jobs/` — job queue management

**CI**: Add test jobs to `.github/workflows/ci.yml`

#### 1.2 Add error tracking

- Install Sentry (`@sentry/nextjs` for frontend, `sentry-sdk[fastapi]` for backend)
- Configure source maps upload in build step
- Add Error Boundary component wrapping `app/layout.tsx`

#### 1.3 Add React Error Boundary

- **File to create**: `components/ErrorBoundary.tsx`
- Wrap the app layout children with it
- Show a user-friendly fallback UI with a "reload" button

---

### Phase 2: Security Hardening

#### 2.1 Add CSP headers

- **File to create or modify**: `middleware.ts` (Next.js middleware)
- Set `Content-Security-Policy` header with appropriate directives
- Allow `'wasm-unsafe-eval'` for FFmpeg/OpenCV WASM
- Allow `'unsafe-inline'` for Tailwind (or use nonces)

#### 2.2 Rate limiting on heavy endpoints

- **File to modify**: `backend/main.py`
- Add Redis-based rate limiting middleware for `/detect` and `/export` endpoints
- Suggested: 5 requests/hour per IP for detection, 10/hour for export

#### 2.3 Guard DEV_MODE in production

- **File to modify**: `backend/config.py`
- Add a startup warning/error if `DEV_MODE=true` when `ALLOWED_ORIGINS` contains non-localhost URLs
- Or: remove DEV_MODE entirely and use a test API key for local dev

#### 2.4 Redis persistence

- **File to modify**: `docker-compose.yml`, `docker-compose.prod.yml`
- Remove `--save "" --appendonly no` flags
- Enable AOF persistence: `--appendonly yes`

---

### Phase 3: Accessibility & SEO

#### 3.1 Accessibility improvements

- **Files to modify**: `components/UserDropdown.tsx`, `app/upload/components/FaceGallery.tsx`
- Add `aria-expanded`, `aria-haspopup` to dropdown toggle
- Add `role="checkbox"`, `aria-checked`, descriptive `aria-label` to face gallery items
- Add `aria-live="polite"` regions for status updates (detection progress, export progress)
- Ensure keyboard navigation works in modals and dropdowns (focus trap)

#### 3.2 SEO optimization

- **File to modify**: `app/layout.tsx`
- Add Open Graph meta tags (`og:title`, `og:description`, `og:image`, `og:url`)
- Add Twitter Card meta tags
- **Files to create**: `public/robots.txt`, `app/sitemap.ts` (Next.js dynamic sitemap)

---

### Phase 4: Performance

#### 4.1 Code splitting

- **Files to modify**: `app/upload/page.tsx`
- Dynamic import heavy components: `FaceGallery`, `ExportModal`, video player components
- Use `next/dynamic` with loading skeletons

#### 4.2 API response caching

- Add `Cache-Control` headers to GET `/api/videos` (short TTL, e.g., 60s)
- Use `stale-while-revalidate` pattern

---

### Phase 5: Observability

#### 5.1 Structured logging

- **Backend**: Switch to JSON-formatted logging (use `python-json-logger`)
- **Frontend**: Replace `console.error` calls with a logging utility that can be configured per environment

#### 5.2 Health monitoring

- Add uptime monitoring (e.g., UptimeRobot, Checkly) for `/api/health`
- Add Redis connection health to the health endpoint
- Document alerting strategy

---

## Verification Plan

After implementing each phase:

1. **Phase 1**: Run `pnpm test` (unit) + `pnpm test:e2e` (Playwright) + verify Sentry receives a test error
2. **Phase 2**: Run `curl -I` against deployed frontend to verify CSP header. Test rate limiting by sending rapid requests. Verify Redis data survives `docker compose restart redis`
3. **Phase 3**: Run Lighthouse accessibility audit (target score > 90). Validate OG tags with opengraph.dev
4. **Phase 4**: Run Lighthouse performance audit. Compare bundle size before/after with `npx next build` analyzer
5. **Phase 5**: Verify JSON logs appear in `docker compose logs backend`. Confirm health check endpoint returns Redis status

---

## Priority Order

If time is limited, implement in this order:

1. Error Boundary + Sentry (highest impact-to-effort ratio)
2. Core unit tests for critical paths (interpolation, API routes)
3. CSP headers + rate limiting
4. Redis persistence
5. Accessibility labels
6. SEO meta tags
7. E2E tests
8. Code splitting
9. Structured logging
10. Full test coverage
