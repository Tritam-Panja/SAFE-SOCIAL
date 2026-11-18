import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { toggleReactionSchema, ToggleReactionInput } from '@fizzy/validation';
import { FeedService } from '../feed/feed.service.js';

export const reactionsRouter = Router();

/**
 * POST /api/v1/reactions/:contentId/toggle
 * Toggle an emoji reaction on approved accessible content.
 * Prevents duplicate reactions.
 */
reactionsRouter.post(
  '/:contentId/toggle',
  requireAuth,
  validateRequest(toggleReactionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const contentId = req.params.contentId;
      const { emoji } = req.body as ToggleReactionInput;

      // 1. Enforce content visibility: Content must be accessible to caller
      const content = await FeedService.getContentById({
        contentId,
        userRole: user.role,
        userAgeGroup: user.ageGroup,
        userId: user.id,
      });

      if (!content) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: 'CONTENT_UNAVAILABLE',
            message: 'Cannot react to content that is private or unavailable for your age group.',
          },
        });
        return;
      }

      // 2. Check if user already reacted with this emoji
      const existingReaction = await prisma.reaction.findUnique({
        where: {
          contentId_userId_emoji: {
            contentId,
            userId: user.id,
            emoji,
          },
        },
      });

      let reacted: boolean;

      if (existingReaction) {
        // Toggle off (remove reaction)
        await prisma.reaction.delete({
          where: { id: existingReaction.id },
        });
        reacted = false;
      } else {
        // Toggle on (create reaction)
        await prisma.reaction.create({
          data: {
            contentId,
            userId: user.id,
            emoji,
          },
        });
        reacted = true;
      }

      // 3. Count total reactions for this content
      const totalReactions = await prisma.reaction.count({
        where: { contentId },
      });

      res.status(200).json({
        success: true,
        data: {
          contentId,
          emoji,
          reacted,
          totalReactions,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/reactions/:contentId
 * Returns reaction summary and whether current user has reacted.
 */
reactionsRouter.get(
  '/:contentId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const contentId = req.params.contentId;

      const [totalCount, userReactions] = await Promise.all([
        prisma.reaction.count({ where: { contentId } }),
        prisma.reaction.findMany({
          where: { contentId, userId: user.id },
          select: { emoji: true },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          contentId,
          totalCount,
          userReactedEmojis: userReactions.map((r) => r.emoji),
          hasReacted: userReactions.length > 0,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
