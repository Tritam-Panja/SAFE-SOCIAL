import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { reviewDecisionSchema, ReviewDecisionInput } from '@fizzy/validation';
import { ModerationService } from './moderation.service.js';
import { UserRole, ContentStatus } from '../../generated/prisma-client/index.js';

export const moderationRouter = Router();

/**
 * GET /api/v1/moderation/queue
 * Returns items in PENDING_REVIEW or UNDER_REVIEW for administrators.
 */
moderationRouter.get(
  '/queue',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const typeFilter = req.query.type as string | undefined;
      const statusFilter = (req.query.status as string) || 'PENDING_REVIEW';

      const items = await prisma.content.findMany({
        where: {
          status: statusFilter === 'ALL' ? undefined : (statusFilter as ContentStatus),
          type: typeFilter ? (typeFilter as any) : undefined,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true,
              ageGroup: true,
            },
          },
          mediaAssets: true,
          requestedAudiences: true,
          approvedAudiences: true,
          submissions: {
            orderBy: { submittedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' }, // Newest first so fresh submissions appear at the top
      });

      res.status(200).json({
        success: true,
        data: items.map((item) => ({
          id: item.id,
          type: item.type,
          status: item.status,
          title: item.title,
          caption: item.caption,
          durationSeconds: item.durationSeconds,
          author: item.author,
          mediaAssets: item.mediaAssets,
          requestedAudiences: item.requestedAudiences.map((r) => r.ageGroup),
          approvedAudiences: item.approvedAudiences.map((a) => a.ageGroup),
          submittedAt: item.submissions[0]?.submittedAt || item.createdAt,
        })),
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/moderation/item/:id
 * Retrieve single item for review with complete moderation history.
 */
moderationRouter.get(
  '/item/:id',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await prisma.content.findUnique({
        where: { id: req.params.id },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true,
              ageGroup: true,
            },
          },
          mediaAssets: true,
          requestedAudiences: true,
          approvedAudiences: true,
          reviews: {
            include: {
              reviewer: { select: { id: true, username: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          moderationActions: {
            include: {
              admin: { select: { id: true, username: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!item) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Content item not found.' },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: item,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/moderation/claim/:id
 * Claim an item for review (moves from PENDING_REVIEW -> UNDER_REVIEW).
 */
moderationRouter.post(
  '/claim/:id',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const content = await ModerationService.claimForReview(req.params.id, req.user!.id);
      res.status(200).json({
        success: true,
        data: { id: content.id, status: 'UNDER_REVIEW' },
        error: null,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: 'CLAIM_FAILED', message: error.message },
      });
    }
  }
);

/**
 * POST /api/v1/moderation/decision/:id
 * Execute an authoritative moderation decision (APPROVE, REJECT, REQUEST_CHANGES).
 */
moderationRouter.post(
  '/decision/:id',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validateRequest(reviewDecisionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as ReviewDecisionInput;
      const result = await ModerationService.makeDecision({
        contentId: req.params.id,
        adminId: req.user!.id,
        decision: input.decision as any,
        approvedAudiences: input.approvedAudiences as any,
        reason: input.reason,
        internalNotes: input.internalNotes,
        ipAddress: req.ip,
      });

      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'DECISION_FAILED',
          message: error.message || 'Failed to apply moderation decision.',
        },
      });
    }
  }
);

/**
 * GET /api/v1/moderation/audit-logs
 * View immutable audit log of platform-wide moderation actions.
 */
moderationRouter.get(
  '/audit-logs',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const logs = await prisma.moderationAction.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, username: true } },
          content: {
            select: { id: true, type: true, title: true, caption: true },
          },
        },
      });

      res.status(200).json({
        success: true,
        data: logs,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
