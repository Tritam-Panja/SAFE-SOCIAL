import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { createReportSchema, resolveReportSchema, CreateReportInput, ResolveReportInput } from '@fizzy/validation';
import { UserRole, ReportStatus, NotificationType } from '../../generated/prisma-client/index.js';
import { FeedService } from '../feed/feed.service.js';
import { RealtimeServer } from '../realtime/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';
import { NotificationService } from '../notifications/index.js';

export const reportsRouter = Router();

reportsRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Reports module ready' });
});

/**
 * POST /api/v1/reports
 * Child or parent reports accessible content for safety review.
 */
reportsRouter.post(
  '/',
  requireAuth,
  validateRequest(createReportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { contentId, reason, details } = req.body as CreateReportInput;

      // 1. Verify content exists & is accessible to user
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
          error: { code: 'CONTENT_NOT_FOUND', message: 'Target content not found or inaccessible.' },
        });
        return;
      }

      // 2. Create ContentReport
      const report = await prisma.contentReport.create({
        data: {
          contentId,
          reporterId: user.id,
          reason,
          details: details || null,
          status: ReportStatus.PENDING,
        },
      });

      // 3. Record AuditLog
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CONTENT_REPORTED',
          entityType: 'ContentReport',
          entityId: report.id,
          details: { contentId, reason },
        },
      });

      // 4. Emit Real-time Notification to Admins
      const realtime = RealtimeServer.getInstance();
      realtime.emitToAdmins(RealtimeEvent.REPORT_CREATED, {
        reportId: report.id,
        contentId: report.contentId,
        reporterId: user.id,
        reason: report.reason,
      });

      const { AdminMetricsService } = await import('../admin/index.js');
      AdminMetricsService.broadcastMetrics('REPORT_CREATED');

      res.status(201).json({
        success: true,
        data: {
          reportId: report.id,
          status: report.status,
          message: 'Report submitted. Our safety team will review this item shortly.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/reports
 * Admin: List reports with filtering and pagination.
 */
reportsRouter.get(
  '/',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const where = status && status !== 'ALL' ? { status: status as ReportStatus } : {};

      const [total, reports] = await Promise.all([
        prisma.contentReport.count({ where }),
        prisma.contentReport.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: { select: { id: true, username: true, role: true, ageGroup: true } },
            content: {
              include: {
                author: { select: { id: true, username: true, displayName: true } },
                mediaAssets: true,
              },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: reports,
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
 * PATCH /api/v1/reports/:id/resolve
 * Admin: Resolves or dismisses a report and records action taken.
 */
reportsRouter.patch(
  '/:id/resolve',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validateRequest(resolveReportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { status, actionTaken } = req.body as ResolveReportInput;

      const report = await prisma.contentReport.findUnique({
        where: { id },
        include: { content: true },
      });

      if (!report) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'REPORT_NOT_FOUND', message: 'Report not found.' },
        });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const r = await tx.contentReport.update({
          where: { id },
          data: {
            status: status as ReportStatus,
            actionTaken,
          },
        });

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: `REPORT_${status}`,
            entityType: 'ContentReport',
            entityId: id,
            details: { actionTaken },
          },
        });

        // Notify reporter that their safety concern was handled
        await NotificationService.createNotification(
          {
            userId: report.reporterId,
            type: NotificationType.SYSTEM_ALERT,
            title: 'Report Update',
            message: `Your report has been reviewed and marked as ${status.toLowerCase()}. Thank you for keeping Fizzy safe!`,
            referenceId: report.contentId,
          },
          tx
        );

        return r;
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
