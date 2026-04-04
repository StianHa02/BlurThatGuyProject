import { describe, it, expect } from 'vitest';
import { formatFileSize, formatDuration, formatDate } from '../format';

describe('formatFileSize', () => {
  it('formats bytes as KB', () => {
    expect(formatFileSize(512)).toBe('1 KB');
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('formatDuration', () => {
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('02:05');
  });

  it('pads single digits', () => {
    expect(formatDuration(61)).toBe('01:01');
  });
});

describe('formatDate', () => {
  it('formats ISO date string', () => {
    const result = formatDate('2024-06-15T12:00:00Z');
    expect(result).toContain('15');
    expect(result).toContain('Jun');
    expect(result).toContain('2024');
  });
});
