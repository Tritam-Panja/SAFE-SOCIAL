import { z } from 'zod';

export const requestUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(120),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().positive(),
  mediaType: z.enum(['IMAGE', 'VIDEO', 'THUMBNAIL']),
  contentId: z.string().uuid().optional(),
});

export const completeUploadSchema = z.object({
  storageKey: z.string().min(1),
  contentId: z.string().uuid().optional(),
  mediaType: z.enum(['IMAGE', 'VIDEO', 'THUMBNAIL']),
  fileSizeBytes: z.number().positive(),
  durationSeconds: z.number().min(1).max(60).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
