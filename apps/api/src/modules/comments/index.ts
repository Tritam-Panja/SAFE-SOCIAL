import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { createCommentInputSchema, reportCommentSchema, CreateCommentInput, ReportCommentInput } from '@fizzy/validation';
import { UserRole, ContentStatus, ContentType } from '../../generated/prisma-client/index.js';
import { FeedService } from '../feed/feed.service.js';

export const commentsRouter = Router();

/**
 * GET /api/v1/comments/:contentId
 * Returns ONLY approved comments on this content.
 */
commentsRouter.get(
  '/:contentId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const contentId = req.params.contentId;

      // 1. Verify caller has access to view this content
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
          error: { code: 'CONTENT_UNAVAILABLE', message: 'Content unavailable.' },
        });
        return;
      }

      // 2. Query APPROVED comments only (or caller's own pending comment)
      const comments = await prisma.comment.findMany({
        where: {
          contentId,
          OR: [
            { status: ContentStatus.APPROVED },
            { authorId: user.id }, // author can see their own pending status
          ],
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              ageGroup: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      res.status(200).json({
        success: true,
        data: comments.map((c) => ({
          id: c.id,
          contentId: c.contentId,
          text: c.text,
          status: c.status,
          isPending: c.status !== ContentStatus.APPROVED,
          author: c.author,
          createdAt: c.createdAt,
          canDelete: c.authorId === user.id || user.role === UserRole.ADMIN,
        })),
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/comments/:contentId
 * Submit comment. Stored as PENDING_REVIEW. Child cannot approve their own comment.
 */
commentsRouter.post(
  '/:contentId',
  requireAuth,
  requireRole(UserRole.CHILD, UserRole.PARENT),
  validateRequest(createCommentInputSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { text } = req.body as CreateCommentInput;
      const contentId = req.params.contentId;

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
          error: { code: 'CONTENT_UNAVAILABLE', message: 'Target content not available for comments.' },
        });
        return;
      }

      // Check parent controls
      if (user.role === UserRole.CHILD && user.childProfile) {
        const controls = await prisma.parentControl.findUnique({
          where: { childProfileId: user.childProfile.id },
        });

        if (controls && !controls.canComment) {
          res.status(403).json({
            success: false,
            data: null,
            error: {
              code: 'COMMENTS_DISABLED_BY_PARENT',
              message: 'Your parent has disabled text comments for your account.',
            },
          });
          return;
        }
      }

      // Create comment in PENDING_REVIEW state
      const result = await prisma.$transaction(async (tx) => {
        const comment = await tx.comment.create({
          data: {
            contentId,
            authorId: user.id,
            text,
            status: ContentStatus.PENDING_REVIEW,
          },
        });

        // Enqueue to moderation Content table
        const modContent = await tx.content.create({
          data: {
            authorId: user.id,
            type: ContentType.COMMENT,
            status: ContentStatus.PENDING_REVIEW,
            caption: text,
          },
        });

        await tx.contentSubmission.create({
          data: {
            contentId: modContent.id,
            submittedById: user.id,
            notes: `Comment on content ${contentId}`,
          },
        });

        return comment;
      });

      res.status(201).json({
        success: true,
        data: {
          id: result.id,
          status: result.status,
          message: 'Comment submitted safely for administrator approval.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/comments/:id
 * Delete own comment where permitted or by admin.
 */
commentsRouter.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const comment = await prisma.comment.findUnique({
        where: { id: req.params.id },
      });

      if (!comment) {
        res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Comment not found.' } });
        return;
      }

      if (comment.authorId !== user.id && user.role !== UserRole.ADMIN) {
        res.status(403).json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You do not have permission to delete this comment.' } });
        return;
      }

      await prisma.comment.delete({ where: { id: comment.id } });

      res.status(200).json({ success: true, message: 'Comment deleted successfully.' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/comments/:id/report
 * Report a comment for safety inspection.
 */
commentsRouter.post(
  '/:id/report',
  requireAuth,
  validateRequest(reportCommentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { reason, details } = req.body as ReportCommentInput;
      const commentId = req.params.id;

      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
      });

      if (!comment) {
        res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Comment not found.' } });
        return;
      }

      // Create Report ticket
      const report = await prisma.contentReport.create({
        data: {
          contentId: comment.contentId,
          reporterId: user.id,
          reason,
          details: `Reported Comment ID: ${commentId} | Text: "${comment.text}" | Details: ${details || 'None'}`,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          reportId: report.id,
          message: 'Thank you for keeping Fizzy safe! Our safety team will review this comment.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
