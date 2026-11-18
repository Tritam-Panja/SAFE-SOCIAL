import { z } from 'zod';
import { AgeGroup, ContentStatus, ContentType, ReviewDecision } from '@fizzy/shared-types';

export const createPostInputSchema = z.object({
  caption: z.string().max(500, 'Caption cannot exceed 500 characters').default(''),
  mediaAssetId: z.string().uuid('Valid media asset ID is required'),
});

export const createReelInputSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title cannot exceed 100 characters'),
  caption: z.string().max(500).default(''),
  videoAssetId: z.string().uuid('Valid video asset ID is required'),
  thumbnailAssetId: z.string().uuid().optional(),
  durationSeconds: z.number().int().min(1).max(60, 'Reels/Shorts duration cannot exceed 60 seconds'),
  type: z.enum([ContentType.SHORT, ContentType.REEL]).default(ContentType.REEL),
  requestedAudiences: z
    .array(z.nativeEnum(AgeGroup))
    .min(1, 'Creator must select at least one requested audience tier (JUNIOR, EXPLORER, or TEEN)'),
});

export const createCommentInputSchema = z.object({
  text: z.string().min(1, 'Comment text cannot be empty').max(300, 'Comment cannot exceed 300 characters'),
});

export const updateBioInputSchema = z.object({
  bio: z.string().max(200, 'Bio cannot exceed 200 characters'),
});

export const updateAvatarInputSchema = z.object({
  mediaAssetId: z.string().uuid('Valid media asset ID is required'),
});

export const reviewDecisionSchema = z.object({
  decision: z.nativeEnum(ReviewDecision),
  approvedAudiences: z.array(z.nativeEnum(AgeGroup)).optional(),
  reason: z.string().max(500).optional(),
  internalNotes: z.string().max(1000).optional(),
}).refine(
  (data) => {
    if (data.decision === ReviewDecision.REJECT && (!data.reason || data.reason.trim().length === 0)) {
      return false;
    }
    if (data.decision === ReviewDecision.REQUEST_CHANGES && (!data.reason || data.reason.trim().length === 0)) {
      return false;
    }
    return true;
  },
  {
    message: 'A rejection or change-request requires an explanatory reason for the child creator.',
  }
);

export type CreatePostInput = z.infer<typeof createPostInputSchema>;
export type CreateReelInput = z.infer<typeof createReelInputSchema>;
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
export type UpdateBioInput = z.infer<typeof updateBioInputSchema>;
export type UpdateAvatarInput = z.infer<typeof updateAvatarInputSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
