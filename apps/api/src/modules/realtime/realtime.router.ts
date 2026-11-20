import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { FeedService } from '../feed/feed.service.js';
import { UserRole, ContentStatus, FriendRequestStatus } from '../../generated/prisma-client/index.js';

export const realtimeRouter = Router();

/**
 * GET /api/v1/realtime/sync
 * Cursor- or timestamp-based missed event recovery endpoint.
 * Called upon WebSocket reconnection or polling fallback.
 * Strictly scopes data to the caller's role, age-group, and user identity.
 */
realtimeRouter.get(
  '/sync',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const sinceParam = req.query.since as string | undefined;
      const sinceDate = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 1000 * 60 * 60); // Default to last 1 hour

      // 1. Unread notifications
      const [unreadNotificationsCount, recentNotifications] = await Promise.all([
        prisma.notification.count({
          where: { userId: user.id, isRead: false },
        }),
        prisma.notification.findMany({
          where: {
            userId: user.id,
            createdAt: { gte: sinceDate },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

      // 2. Role-specific state recovery
      let parentControls: any = null;
      let pendingFriendRequestsCount = 0;
      let pendingSubmissionsCount = 0;
      let adminMetrics: any = null;

      if (user.role === UserRole.CHILD && user.childProfile) {
        // Child's latest safety controls
        parentControls = await prisma.parentControl.findUnique({
          where: { childProfileId: user.childProfile.id },
        });

        // Child's incoming pending friend requests
        pendingFriendRequestsCount = await prisma.friendRequest.count({
          where: {
            receiverId: user.id,
            status: FriendRequestStatus.PENDING,
          },
        });
      }

      if (user.role === UserRole.ADMIN) {
        // Admin moderation & reports counts
        const [pendingContent, pendingReports] = await Promise.all([
          prisma.content.count({ where: { status: ContentStatus.PENDING_REVIEW } }),
          prisma.contentReport.count({ where: { status: 'PENDING' } }),
        ]);

        adminMetrics = {
          pendingContent,
          pendingReports,
        };
      }

      // 3. New approved feed items since disconnection
      const newFeedItems = await FeedService.getFeed({
        userRole: user.role,
        userAgeGroup: user.ageGroup,
        userId: user.id,
        limit: 10,
      });

      res.status(200).json({
        success: true,
        data: {
          syncedAt: new Date().toISOString(),
          unreadNotificationsCount,
          recentNotifications,
          parentControls,
          pendingFriendRequestsCount,
          adminMetrics,
          latestFeedSample: newFeedItems.items,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
