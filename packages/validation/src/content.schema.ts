import { z } from 'zod';
import { AgeGroup, ContentStatus } from '@fizzy/shared-types';

export const createPostSchema = z.object({
  caption: z.string().max(250).default(''),
  mediaKey: z.string().min(1, 'Media upload reference is required'),
  thumbnailKey: z.string().optional(),
  // Note: Creator does NOT select an audience for posts.
});

export const createReelSchema = z.object({
  title: z.string().min(1).max(100),
  videoKey: z.string().min(1, 'Video upload reference is required'),
  thumbnailKey: z.string().min(1, 'Thumbnail reference is required'),
  durationSeconds: z.number().min(1).max(60),
  creatorRequestedAudiences: z.array(z.nativeEnum(AgeGroup)).min(1, 'Creator must specify at least one requested audience tier'),
});

export const moderateItemSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
  approvedAudiences: z.array(z.nativeEnum(AgeGroup)).optional(),
  rejectionReason: z.string().max(300).optional(),
  internalNotes: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.decision === 'APPROVE' && (!data.approvedAudiences || data.approvedAudiences.length === 0)) {
      return false;
    }
    if (data.decision === 'REJECT' && !data.rejectionReason) {
      return false;
    }
    return true;
  },
  {
    message: 'Approvals require approvedAudiences; rejections require a rejectionReason.',
  }
);
