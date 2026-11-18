import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { FeedService } from '../feed/feed.service.js';

export const contentsRouter = Router();

/**
 * GET /api/v1/contents/:id
 * Direct single content item lookup.
 * Enforces strict backend age-group visibility checks.
 * An unauthorized child knowing the ID cannot access unapproved or out-of-tier content.
 */
contentsRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const content = await FeedService.getContentById({
        contentId: req.params.id,
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
            message:
              'This content is not available or does not meet the safety requirements for your age tier.',
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: content.id,
          type: content.type,
          status: content.status,
          title: content.title,
          caption: content.caption,
          durationSeconds: content.durationSeconds,
          author: content.author,
          mediaAssets: content.mediaAssets.filter((m) => !m.isQuarantined || user.role === 'ADMIN' || content.authorId === user.id),
          approvedAudiences: content.approvedAudiences.map((a) => a.ageGroup),
          commentCount: content._count?.comments || 0,
          reactionCount: content._count?.reactions || 0,
          createdAt: content.createdAt,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
