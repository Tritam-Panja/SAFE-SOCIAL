import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { FeedService } from './feed.service.js';
import { ContentType } from '../../generated/prisma-client/index.js';

export const feedRouter = Router();

/**
 * GET /api/v1/feed
 * Main discovery and home feed.
 * Fully filters by age group at the SQL/Prisma query level.
 */
feedRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const typeFilter = req.query.type as ContentType | undefined;

      const result = await FeedService.getFeed({
        userRole: user.role,
        userAgeGroup: user.ageGroup,
        userId: user.id,
        page,
        limit,
        contentType: typeFilter,
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
