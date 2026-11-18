import { z } from 'zod';

export const updateDisplayNameSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(30, 'Display name cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9 _-]+$/, 'Display name can only contain letters, numbers, spaces, underscores, and hyphens'),
});

export const toggleReactionSchema = z.object({
  emoji: z.string().min(1).max(8).default('❤️'),
});

export const reportCommentSchema = z.object({
  reason: z.string().min(3, 'Please provide a reason').max(300),
  details: z.string().max(500).optional(),
});

export const sendFriendRequestSchema = z.object({
  targetUsername: z.string().min(3),
});

export const respondFriendRequestSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE']),
});

export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type ReportCommentInput = z.infer<typeof reportCommentSchema>;
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type RespondFriendRequestInput = z.infer<typeof respondFriendRequestSchema>;
