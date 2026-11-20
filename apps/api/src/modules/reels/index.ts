import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { createReelInputSchema, CreateReelInput } from '@fizzy/validation';
import { UserRole, ContentStatus, ContentType } from '../../generated/prisma-client/index.js';
import { FeedService } from '../feed/feed.service.js';
import { RealtimeServer } from '../realtime/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';

export const reelsRouter = Router();

/**
 * GET /api/v1/reels/feed
 * Paginated video reels and shorts feed filtered strictly by child's age group.
 */
reelsRouter.get(
  '/feed',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      // Check if child has permission to watch shorts/reels
      if (user.role === UserRole.CHILD && user.childProfile) {
        const controls = await prisma.parentControl.findUnique({
          where: { childProfileId: user.childProfile.id },
        });

        if (controls && !controls.canWatchShortsReels) {
          res.status(403).json({
            success: false,
            data: null,
            error: {
              code: 'REELS_DISABLED_BY_PARENT',
              message: 'Shorts and Reels have been restricted by your parent or guardian.',
            },
          });
          return;
        }
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await FeedService.getFeed({
        userRole: user.role,
        userAgeGroup: user.ageGroup,
        userId: user.id,
        page,
        limit,
        contentType: ContentType.REEL,
      });

      res.status(200).json({
        success: true,
        data: result.items,
        meta: result.meta,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/reels
 * Child submits a Short video or Reel.
 * STRICT BUSINESS RULE:
 * - Creator MUST specify one or more requested audiences.
 * - Stored in ContentRequestedAudience separately.
 * - Status is set to PENDING_REVIEW.
 * - Content remains completely private until admin review.
 */
reelsRouter.post(
  '/',
  requireAuth,
  requireRole(UserRole.CHILD),
  validateRequest(createReelInputSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const input = req.body as CreateReelInput;

      // 1. Verify video asset ownership
      const videoAsset = await prisma.mediaAsset.findUnique({
        where: { id: input.videoAssetId },
      });

      if (!videoAsset || !videoAsset.storageKey.includes(user.id)) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN_MEDIA_ASSET',
            message: 'You can only attach video assets you uploaded.',
          },
        });
        return;
      }

      // 2. Create Content, link assets, and store requested audiences atomically
      const newReel = await prisma.$transaction(async (tx) => {
        const reel = await tx.content.create({
          data: {
            authorId: user.id,
            type: input.type as any,
            status: ContentStatus.PENDING_REVIEW,
            title: input.title,
            caption: input.caption,
            durationSeconds: input.durationSeconds,
          },
        });

        // Link video asset to reel
        await tx.mediaAsset.update({
          where: { id: videoAsset.id },
          data: { contentId: reel.id },
        });

        // If thumbnail supplied, link it too
        if (input.thumbnailAssetId) {
          await tx.mediaAsset.update({
            where: { id: input.thumbnailAssetId },
            data: { contentId: reel.id },
          });
        }

        // Store requested audiences separately (never overwritten!)
        await tx.contentRequestedAudience.createMany({
          data: input.requestedAudiences.map((tier) => ({
            contentId: reel.id,
            ageGroup: tier as any,
          })),
        });

        // Register initial submission for review queue
        await tx.contentSubmission.create({
          data: {
            contentId: reel.id,
            submittedById: user.id,
            notes: `Requested audience: ${input.requestedAudiences.join(', ')}`,
          },
        });

        return reel;
      });

      // Emit Real-time Events
      const realtime = RealtimeServer.getInstance();
      realtime.emitToAdmins(RealtimeEvent.CONTENT_SUBMITTED, {
        contentId: newReel.id,
        type: newReel.type,
        authorId: user.id,
        authorUsername: user.username,
        submittedAt: new Date().toISOString(),
      });
      realtime.emitToAdmins(RealtimeEvent.MODERATION_QUEUE_UPDATED, {
        action: 'ITEM_ADDED',
        contentId: newReel.id,
      });

      const { AdminMetricsService } = await import('../admin/index.js');
      AdminMetricsService.broadcastMetrics('REEL_SUBMITTED');

      res.status(201).json({
        success: true,
        data: {
          id: newReel.id,
          type: newReel.type,
          title: newReel.title,
          status: newReel.status,
          requestedAudiences: input.requestedAudiences,
          message: 'Video reel submitted safely and is now awaiting administrator review.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
