import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Must import after mocking fetch
const { loadModels, cancelJob, getJobStatus, getJobResult } = await import('../faceClient');

beforeEach(() => {
  fetchMock.mockReset();
});

describe('loadModels', () => {
  it('calls /health endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ model: 'SCRFD-2.5G' }),
    });
    await loadModels();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health'));
  });

  it('throws when backend is down', async () => {
    // Reset module state to force a fresh loadModels check
    vi.resetModules();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const fresh = await import('../faceClient');
    await expect(fresh.loadModels()).rejects.toThrow('Backend not responding');
  });
});

describe('cancelJob', () => {
  it('sends POST to cancel endpoint', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await cancelJob('job-123');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/job/job-123/cancel'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not throw on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    await expect(cancelJob('job-123')).resolves.toBeUndefined();
  });
});

describe('getJobStatus', () => {
  it('returns parsed status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'running',
          position: null,
          thread_budget: 4,
          progress: 0.5,
        }),
    });
    const status = await getJobStatus('job-456');
    expect(status.status).toBe('running');
    expect(status.progress).toBe(0.5);
  });

  it('throws on error response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Job not found' }),
    });
    await expect(getJobStatus('bad-job')).rejects.toThrow('Job not found');
  });
});

describe('getJobResult', () => {
  it('returns tracks array', async () => {
    const mockTracks = [{ id: 1, frames: [] }];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: mockTracks }),
    });
    const tracks = await getJobResult('job-789');
    expect(tracks).toEqual(mockTracks);
  });

  it('returns empty array when no results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const tracks = await getJobResult('job-empty');
    expect(tracks).toEqual([]);
  });
});
