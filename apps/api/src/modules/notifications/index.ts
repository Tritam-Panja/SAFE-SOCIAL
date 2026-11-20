import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth } from '../../middleware/auth.js';

export const notificationsRouter = Router();
export * from './notification.service.js';

notificationsRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Notifications module ready' });
});

/**
 * GET /api/v1/notifications
 * Returns paginated notifications strictly for the authenticated recipient.
 */
notificationsRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const [total, unreadCount, items] = await Promise.all([
        prisma.notification.count({ where: { userId: user.id } }),
        prisma.notification.count({ where: { userId: user.id, isRead: false } }),
        prisma.notification.findMany({
          where: { userId: user.id },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: items,
        meta: {
          page,
          limit,
          total,
          unreadCount,
          totalPages: Math.ceil(total / limit),
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read (strictly owned by recipient).
 */
notificationsRouter.patch(
  '/:id/read',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { id } = req.params;

      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      if (!notification || notification.userId !== user.id) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Notification not found.' },
        });
        return;
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      res.status(200).json({
        success: true,
        data: updated,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications as read for current user.
 */
notificationsRouter.patch(
  '/read-all',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      const result = await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });

      res.status(200).json({
        success: true,
        data: { count: result.count, markedAsRead: true },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
