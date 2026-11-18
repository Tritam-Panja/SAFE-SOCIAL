import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { UserRole, ContentStatus } from '../../generated/prisma-client/index.js';

export const adminRouter = Router();

adminRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Admin module ready' });
});

/**
 * GET /api/v1/admin/dashboard
 * Real-time aggregated statistics directly from PostgreSQL.
 * - Total users, child accounts, parent accounts
 * - Pending, approved, rejected, reported content counts
 * - Recent moderation actions & audit log
 */
adminRouter.get(
  '/dashboard',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [
        totalUsers,
        childUsers,
        parentUsers,
        pendingContent,
        approvedContent,
        rejectedContent,
        reportedCount,
        recentActions,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: UserRole.CHILD } }),
        prisma.user.count({ where: { role: UserRole.PARENT } }),
        prisma.content.count({ where: { status: ContentStatus.PENDING_REVIEW } }),
        prisma.content.count({ where: { status: { in: [ContentStatus.APPROVED, ContentStatus.PUBLISHED] } } }),
        prisma.content.count({ where: { status: ContentStatus.REJECTED } }),
        prisma.contentReport.count({ where: { status: 'PENDING' } }),
        prisma.moderationAction.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            admin: { select: { id: true, username: true, displayName: true } },
            content: {
              select: {
                id: true,
                type: true,
                title: true,
                author: { select: { id: true, username: true, ageGroup: true } },
              },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          metrics: {
            totalUsers,
            childUsers,
            parentUsers,
            pendingSubmissions: pendingContent,
            approvedContent,
            rejectedContent,
            reportedContent: reportedCount,
          },
          recentActions,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/audit-logs
 * Paginated system audit logs for administrative review.
 */
adminRouter.get(
  '/audit-logs',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const actionFilter = req.query.action as string | undefined;

      const where = actionFilter ? { action: actionFilter } : {};

      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, username: true, role: true } },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: logs,
        meta: {
          page,
          limit,
          total,
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
 * GET /api/v1/admin/users
 * Search, filter and list users with moderation and safety context.
 */
adminRouter.get(
  '/users',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const role = req.query.role as UserRole | undefined;
      const search = req.query.search as string | undefined;

      const where: any = {};
      if (role && Object.values(UserRole).includes(role)) {
        where.role = role;
      }
      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
            ageGroup: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            childProfile: {
              select: {
                parentControls: {
                  select: {
                    isPaused: true,
                    canAddFriends: true,
                    canComment: true,
                  },
                },
              },
            },
            _count: {
              select: {
                contents: true,
                comments: true,
                reactions: true,
              },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: users,
        meta: {
          page,
          limit,
          total,
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
 * PATCH /api/v1/admin/users/:id/status
 * Toggle user active status or pause state.
 */
adminRouter.patch(
  '/users/:id/status',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params.id as string;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          data: null,
          error: { code: 'INVALID_INPUT', message: 'isActive must be a boolean' },
        });
        return;
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive },
        select: {
          id: true,
          username: true,
          role: true,
          isActive: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          entityType: 'User',
          entityId: userId,
          actorId: req.user!.id,
          details: { updatedUserId: userId, newStatus: isActive },
        },
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
