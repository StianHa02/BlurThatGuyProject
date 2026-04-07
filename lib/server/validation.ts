import { z } from 'zod';

export const PresignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
});

export const PresignTracksSchema = z.object({
  filename: z.string().min(1).max(255),
});

export const SaveProjectSchema = z.object({
  originalKey: z.string().min(1),
  tracksKey: z.string().min(1),
  filename: z.string().min(1).max(255),
  fps: z.number().positive().optional(),
  frameCount: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  sampleRate: z.number().int().min(1).max(60).optional(),
  trackCount: z.number().int().nonnegative().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
});

export const DeleteProjectSchema = z.object({
  id: z.string().uuid(),
});

export const CheckEmailSchema = z.object({
  email: z.string().email(),
});
