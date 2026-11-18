import { z } from 'zod';

export const createReportSchema = z.object({
  contentId: z.string().uuid('Invalid content ID'),
  reason: z.string().min(3, 'Reason must be at least 3 characters').max(100, 'Reason too long'),
  details: z.string().max(500, 'Details cannot exceed 500 characters').optional(),
});

export const resolveReportSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  actionTaken: z.string().min(3, 'Action taken must be recorded').max(200),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
