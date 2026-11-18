import { z } from 'zod';

export const createParentLinkRequestSchema = z.object({
  childUsername: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  verificationCode: z
    .string()
    .min(4, 'Parent linking code must be at least 4 characters')
    .max(64, 'Parent linking code is too long'),
});

export const updateParentLinkRequestSchema = z.object({
  status: z.enum(['CONFIRMED', 'REVOKED']),
  verificationCode: z.string().optional(),
});

export const updateParentSettingsSchema = z.object({
  isPaused: z.boolean().optional(),
  pauseReason: z.string().max(200).optional().nullable(),
  canAddFriends: z.boolean().optional(),
  canReceiveFriendRequests: z.boolean().optional(),
  requireParentApprovalForFriends: z.boolean().optional(),
  canComment: z.boolean().optional(),
  canCreateContent: z.boolean().optional(),
  canWatchShortsReels: z.boolean().optional(),
  dailyLimitMinutes: z.number().int().min(0).max(1440).optional(),
  bedtimeStartHour: z.number().int().min(0).max(23).optional().nullable(),
  bedtimeEndHour: z.number().int().min(0).max(23).optional().nullable(),
  notifyOnFriendRequest: z.boolean().optional(),
  notifyOnContentStatus: z.boolean().optional(),
});

export type CreateParentLinkRequestInput = z.infer<typeof createParentLinkRequestSchema>;
export type UpdateParentLinkRequestInput = z.infer<typeof updateParentLinkRequestSchema>;
export type UpdateParentSettingsInput = z.infer<typeof updateParentSettingsSchema>;
