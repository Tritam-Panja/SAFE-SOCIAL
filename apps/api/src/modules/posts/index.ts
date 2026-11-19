import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { createPostInputSchema, CreatePostInput } from '@fizzy/validation';
import { UserRole, ContentStatus, ContentType } from '../../generated/prisma-client/index.js';
import { RealtimeServer } from '../realtime/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';

export const postsRouter = Router();

/**
 * POST /api/v1/posts
 * Child submits a photo post.
 * STRICT BUSINESS RULE:
 * - Content is stored as PENDING_REVIEW.
 * - Child CANNOT select audience.
 * - Content remains completely private until admin review.
 */
postsRouter.post(
  '/',
  requireAuth,
  requireRole(UserRole.CHILD),
  validateRequest(createPostInputSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const input = req.body as CreatePostInput;

      // 1. Check parent controls for content creation
      if (user.childProfile) {
        const controls = await prisma.parentControl.findUnique({
          where: { childProfileId: user.childProfile.id },
        });

        if (controls && !controls.canCreateContent) {
          res.status(403).json({
            success: false,
            data: null,
            error: {
              code: 'CONTENT_CREATION_DISABLED_BY_PARENT',
              message: 'Your parent has turned off creating new posts for your account.',
            },
          });
          return;
        }
      }

      // 2. Verify media asset ownership
      const mediaAsset = await prisma.mediaAsset.findUnique({
        where: { id: input.mediaAssetId },
      });

      if (!mediaAsset || !mediaAsset.storageKey.includes(user.id)) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN_MEDIA_ASSET',
            message: 'You can only attach media assets you uploaded.',
          },
        });
        return;
      }

      // 2. Create Content and link to mediaAsset atomically
      const newPost = await prisma.$transaction(async (tx) => {
        const post = await tx.content.create({
          data: {
            authorId: user.id,
            type: ContentType.POST,
            status: ContentStatus.PENDING_REVIEW,
            caption: input.caption,
          },
        });

        // Link media asset to this content
        await tx.mediaAsset.update({
          where: { id: mediaAsset.id },
          data: { contentId: post.id },
        });

        // Register initial submission for review queue
        await tx.contentSubmission.create({
          data: {
            contentId: post.id,
            submittedById: user.id,
            notes: 'Initial child photo post submission',
          },
        });

        return post;
      });

      // Emit Real-time Events
      const realtime = RealtimeServer.getInstance();
      realtime.emitToAdmins(RealtimeEvent.CONTENT_SUBMITTED, {
        contentId: newPost.id,
        type: newPost.type,
        authorId: user.id,
        authorUsername: user.username,
        submittedAt: new Date().toISOString(),
      });
      realtime.emitToAdmins(RealtimeEvent.MODERATION_QUEUE_UPDATED, {
        action: 'ITEM_ADDED',
        contentId: newPost.id,
      });

      res.status(201).json({
        success: true,
        data: {
          id: newPost.id,
          type: newPost.type,
          status: newPost.status,
          caption: newPost.caption,
          message: 'Post submitted safely and is now awaiting administrator review.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/posts/my-submissions
 * Child views their own submissions and live moderation status.
 */
postsRouter.get(
  '/my-submissions',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const items = await prisma.content.findMany({
        where: {
          authorId: user.id,
          type: ContentType.POST,
        },
        include: {
          mediaAssets: true,
          reviews: {
            select: {
              decision: true,
              decisionReason: true,
              createdAt: true,
              // Internal notes are explicitly omitted to protect child privacy
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: items.map((post) => ({
          id: post.id,
          caption: post.caption,
          status: post.status,
          mediaUrl: post.mediaAssets[0]?.url,
          createdAt: post.createdAt,
          reviewFeedback: post.reviews[0]?.decisionReason || null,
        })),
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
