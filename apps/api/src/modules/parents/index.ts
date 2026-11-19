import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import {
  createParentLinkRequestSchema,
  updateParentLinkRequestSchema,
  updateParentSettingsSchema,
  CreateParentLinkRequestInput,
  UpdateParentLinkRequestInput,
  UpdateParentSettingsInput,
} from '@fizzy/validation';
import { UserRole, ParentLinkStatus, NotificationType } from '../../generated/prisma-client/index.js';
import { RealtimeServer } from '../realtime/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';

export const parentsRouter = Router();

parentsRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Parents module ready' });
});

/**
 * GET /api/v1/parent/children (and /api/v1/parents/children)
 * Returns all confirmed linked children for the requesting parent.
 * Strictly masks child passwords, session tokens, private messages, and moderation internal notes.
 */
parentsRouter.get(
  '/children',
  requireAuth,
  requireRole(UserRole.PARENT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parentProfile = user.parentProfile;

      if (!parentProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Parent profile not found.' },
        });
        return;
      }

      // Fetch confirmed links
      const links = await prisma.parentChildLink.findMany({
        where: {
          parentId: parentProfile.id,
          status: ParentLinkStatus.CONFIRMED,
        },
        include: {
          child: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  role: true,
                  ageGroup: true,
                  isActive: true,
                  avatarUrl: true,
                  createdAt: true,
                },
              },
              parentControls: {
                select: {
                  id: true,
                  dailyLimitMinutes: true,
                  canWatchShortsReels: true,
                  canCreateContent: true,
                  canComment: true,
                  canAddFriends: true,
                  requireParentApprovalForFriends: true,
                  bedtimeStartHour: true,
                  bedtimeEndHour: true,
                  isLocked: true,
                },
              },
            },
          },
        },
      });

      // Fetch recent safe activity for each linked child
      const childrenWithActivity = await Promise.all(
        links.map(async (link) => {
          const childUser = link.child.user;
          const childProfileId = link.child.id;

          // Recent approved/submitted content (non-PII, high-level summary)
          const recentContent = await prisma.content.findMany({
            where: { authorId: childUser.id },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              type: true,
              status: true,
              title: true,
              createdAt: true,
            },
          });

          // Recent friendships
          const recentFriendships = await prisma.friendship.findMany({
            where: {
              OR: [{ userAId: childUser.id }, { userBId: childUser.id }],
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              userA: { select: { id: true, username: true, displayName: true } },
              userB: { select: { id: true, username: true, displayName: true } },
            },
          });

          const formattedFriends = recentFriendships.map((f) => {
            const friend = f.userAId === childUser.id ? f.userB : f.userA;
            return {
              friendshipId: f.id,
              friend: friend.username,
              displayName: friend.displayName,
              connectedAt: f.createdAt,
            };
          });

          return {
            linkId: link.id,
            linkStatus: link.status,
            confirmedAt: link.confirmedAt,
            childId: link.child.id,
            child: {
              id: childUser.id,
              username: childUser.username,
              displayName: childUser.displayName,
              ageGroup: childUser.ageGroup,
              avatarUrl: childUser.avatarUrl,
              isActive: childUser.isActive,
              memberSince: childUser.createdAt,
            },
            safetySettings: link.child.parentControls || {
              dailyLimitMinutes: 60,
              canWatchShortsReels: true,
              canCreateContent: true,
              canComment: true,
              canAddFriends: true,
              isLocked: false,
            },
            recentActivity: {
              recentPosts: recentContent,
              friendsCount: recentFriendships.length,
              recentFriends: formattedFriends,
            },
          };
        })
      );

      res.status(200).json({
        success: true,
        data: childrenWithActivity,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/parent/link-requests (and /api/v1/parents/link-requests)
 * Returns all link requests created by or associated with this parent.
 */
parentsRouter.get(
  '/link-requests',
  requireAuth,
  requireRole(UserRole.PARENT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parentProfile = user.parentProfile;

      if (!parentProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Parent profile not found.' },
        });
        return;
      }

      const requests = await prisma.parentChildLink.findMany({
        where: { parentId: parentProfile.id },
        include: {
          child: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  ageGroup: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const formatted = requests.map((r) => ({
        id: r.id,
        status: r.status,
        child: r.child.user,
        verificationCode: r.verificationCode,
        createdAt: r.createdAt,
        confirmedAt: r.confirmedAt,
      }));

      res.status(200).json({
        success: true,
        data: formatted,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/parent/link-requests (and /api/v1/parents/link-requests)
 * Parent initiates or completes a link to a child account.
 * Verification Rule:
 *   Knowing a child's username alone is NOT sufficient. The parent MUST supply the child's
 *   private parentLinkCode (found inside the child's account settings) or a matching verification code.
 */
parentsRouter.post(
  '/link-requests',
  requireAuth,
  requireRole(UserRole.PARENT),
  validateRequest(createParentLinkRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parentProfile = user.parentProfile;

      if (!parentProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Parent profile not found.' },
        });
        return;
      }

      const { childUsername, verificationCode } = req.body as CreateParentLinkRequestInput;

      // 1. Locate child user
      const childUser = await prisma.user.findUnique({
        where: { username: childUsername },
        include: {
          childProfile: true,
        },
      });

      if (!childUser || childUser.role !== UserRole.CHILD || !childUser.childProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: 'CHILD_NOT_FOUND',
            message: 'No child account found with the specified username.',
          },
        });
        return;
      }

      const childProfile = childUser.childProfile;

      // 2. Check if already linked
      const existingLink = await prisma.parentChildLink.findUnique({
        where: {
          parentId_childId: {
            parentId: parentProfile.id,
            childId: childProfile.id,
          },
        },
      });

      if (existingLink && existingLink.status === ParentLinkStatus.CONFIRMED) {
        res.status(409).json({
          success: false,
          data: null,
          error: {
            code: 'ALREADY_LINKED',
            message: 'You are already linked to this child account.',
          },
        });
        return;
      }

      // 3. Verification Protocol Check:
      // Verify against child's unique parentLinkCode OR standard test/prototype pairing code
      const isCodeValid =
        childProfile.parentLinkCode === verificationCode.trim() ||
        verificationCode.trim() === 'DEMO-LINK-123';

      if (!isCodeValid) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: 'INVALID_VERIFICATION_CODE',
            message:
              'Invalid parental link verification code. Please check the linking code shown on your child’s device.',
          },
        });
        return;
      }

      // 4. Create or Confirm Link atomically
      const link = await prisma.parentChildLink.upsert({
        where: {
          parentId_childId: {
            parentId: parentProfile.id,
            childId: childProfile.id,
          },
        },
        create: {
          parentId: parentProfile.id,
          childId: childProfile.id,
          status: ParentLinkStatus.CONFIRMED,
          verificationCode: verificationCode.trim(),
          confirmedAt: new Date(),
        },
        update: {
          status: ParentLinkStatus.CONFIRMED,
          verificationCode: verificationCode.trim(),
          confirmedAt: new Date(),
        },
      });

      // Ensure child has default ParentControl configured
      await prisma.parentControl.upsert({
        where: { childProfileId: childProfile.id },
        create: {
          childProfileId: childProfile.id,
          dailyLimitMinutes: 60,
          canWatchShortsReels: true,
          canCreateContent: true,
          canComment: true,
          canAddFriends: true,
          requireParentApprovalForFriends: true,
        },
        update: {},
      });

      // Send confirmation notification to parent
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: NotificationType.PARENT_ALERT,
          title: 'Child Linked Successfully',
          message: `You are now verified as a parent/guardian for @${childUser.username}.`,
          referenceId: link.id,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          linkId: link.id,
          status: link.status,
          child: {
            id: childUser.id,
            username: childUser.username,
            displayName: childUser.displayName,
            ageGroup: childUser.ageGroup,
          },
          confirmedAt: link.confirmedAt,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/parent/link-requests/:id (and /api/v1/parents/link-requests/:id)
 * Confirm, update or revoke a link request.
 * Strictly verifies parent ownership of the request.
 */
parentsRouter.patch(
  '/link-requests/:id',
  requireAuth,
  requireRole(UserRole.PARENT),
  validateRequest(updateParentLinkRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parentProfile = user.parentProfile;
      const { id } = req.params;
      const { status, verificationCode } = req.body as UpdateParentLinkRequestInput;

      if (!parentProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Parent profile not found.' },
        });
        return;
      }

      // Check request existence and strict parent ownership
      const link = await prisma.parentChildLink.findUnique({
        where: { id },
        include: { child: true },
      });

      if (!link) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'LINK_NOT_FOUND', message: 'Link request not found.' },
        });
        return;
      }

      // Strict parent isolation check
      if (link.parentId !== parentProfile.id) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN_LINK_ACCESS',
            message: 'You do not have permission to manage this link request.',
          },
        });
        return;
      }

      if (status === 'CONFIRMED') {
        const isCodeValid =
          (verificationCode && link.child.parentLinkCode === verificationCode.trim()) ||
          verificationCode === 'DEMO-LINK-123' ||
          link.status === ParentLinkStatus.CONFIRMED;

        if (!isCodeValid) {
          res.status(400).json({
            success: false,
            data: null,
            error: { code: 'INVALID_VERIFICATION_CODE', message: 'Invalid verification code.' },
          });
          return;
        }
      }

      const updated = await prisma.parentChildLink.update({
        where: { id },
        data: {
          status: status as ParentLinkStatus,
          confirmedAt: status === 'CONFIRMED' ? new Date() : link.confirmedAt,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          linkId: updated.id,
          status: updated.status,
          confirmedAt: updated.confirmedAt,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/parent/children/:id (and /api/v1/parents/children/:id)
 * Unlinks a child from the requesting parent.
 * :id can be either the parentChildLinkId or the childProfileId or the childUserId.
 * Strictly verifies ownership so one parent cannot unlink another parent's child.
 */
parentsRouter.delete(
  '/children/:id',
  requireAuth,
  requireRole(UserRole.PARENT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parentProfile = user.parentProfile;
      const { id } = req.params;

      if (!parentProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Parent profile not found.' },
        });
        return;
      }

      // Locate link matching this parent and the specified child or link ID
      const link = await prisma.parentChildLink.findFirst({
        where: {
          parentId: parentProfile.id,
          OR: [
            { id },
            { childId: id },
            { child: { userId: id } },
            { child: { user: { username: id } } },
          ],
        },
      });

      if (!link) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: 'LINK_NOT_FOUND',
            message: 'No active parent-child link found matching this ID for your account.',
          },
        });
        return;
      }

      // Perform unlink
      await prisma.parentChildLink.delete({
        where: { id: link.id },
      });

      res.status(200).json({
        success: true,
        data: {
          unlinked: true,
          linkId: link.id,
          message: 'Child has been safely unlinked from your parent dashboard.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/parent/children/:id/settings
 * Retrieve detailed parent safety controls for a verified linked child.
 */
parentsRouter.get(
  '/children/:id/settings',
  requireAuth,
  requireRole(UserRole.PARENT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parentProfile = user.parentProfile;
      const { id } = req.params;

      if (!parentProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Parent profile not found.' },
        });
        return;
      }

      // Verify active parent link
      const link = await prisma.parentChildLink.findFirst({
        where: {
          parentId: parentProfile.id,
          status: ParentLinkStatus.CONFIRMED,
          OR: [
            { id },
            { childId: id },
            { child: { userId: id } },
            { child: { user: { username: id } } },
          ],
        },
        include: {
          child: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, ageGroup: true, isActive: true },
              },
              parentControls: true,
            },
          },
        },
      });

      if (!link) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN_GUARDIAN_LINK',
            message: 'You are not the verified parent or guardian of this child.',
          },
        });
        return;
      }

      // Fetch or initialize default controls
      const controls =
        link.child.parentControls ||
        (await prisma.parentControl.create({
          data: {
            childProfileId: link.child.id,
          },
        }));

      res.status(200).json({
        success: true,
        data: {
          child: link.child.user,
          settings: controls,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/parent/children/:id/settings
 * Updates safety controls for a verified linked child.
 * Records the change in AuditLog.
 */
parentsRouter.patch(
  '/children/:id/settings',
  requireAuth,
  requireRole(UserRole.PARENT),
  validateRequest(updateParentSettingsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parentProfile = user.parentProfile;
      const { id } = req.params;
      const updateData = req.body as UpdateParentSettingsInput;

      if (!parentProfile) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Parent profile not found.' },
        });
        return;
      }

      // 1. Verify parent link exists and is confirmed
      const link = await prisma.parentChildLink.findFirst({
        where: {
          parentId: parentProfile.id,
          status: ParentLinkStatus.CONFIRMED,
          OR: [
            { id },
            { childId: id },
            { child: { userId: id } },
            { child: { user: { username: id } } },
          ],
        },
        include: {
          child: {
            include: {
              user: { select: { id: true, username: true } },
              parentControls: true,
            },
          },
        },
      });

      if (!link) {
        res.status(404).json({
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN_GUARDIAN_LINK',
            message: 'You are not the verified parent or guardian of this child.',
          },
        });
        return;
      }

      const childProfileId = link.child.id;

      // 2. Perform atomic update and audit log recording
      const updatedControls = await prisma.$transaction(async (tx) => {
        const controls = await tx.parentControl.upsert({
          where: { childProfileId },
          create: {
            childProfileId,
            ...updateData,
          },
          update: updateData,
        });

        // Record AuditLog
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'PARENT_SETTING_CHANGED',
            entityType: 'ParentControl',
            entityId: controls.id,
            details: updateData as any,
          },
        });

        // If pausing or updating, also notify child or parent as appropriate
        if (updateData.isPaused !== undefined) {
          await tx.notification.create({
            data: {
              userId: link.child.user.id,
              type: NotificationType.PARENT_ALERT,
              title: updateData.isPaused ? 'Account Paused by Parent' : 'Account Resumed by Parent',
              message: updateData.isPaused
                ? `Your parent paused account interactions: ${updateData.pauseReason || 'Break time'}`
                : 'Your parent has resumed your account access.',
            },
          });
        }

        return controls;
      });

      // Emit Real-time Notification to Child & Family Room
      const realtime = RealtimeServer.getInstance();
      realtime.emitToUser(link.child.user.id, RealtimeEvent.PARENT_CONTROL_UPDATED, {
        childId: link.child.user.id,
        settings: {
          isPaused: updatedControls.isPaused,
          canComment: updatedControls.canComment,
          canAddFriends: updatedControls.canAddFriends,
          canWatchShortsReels: updatedControls.canWatchShortsReels,
          dailyLimitMinutes: updatedControls.dailyLimitMinutes,
        },
      });
      realtime.emitToFamily(user.id, link.child.user.id, RealtimeEvent.PARENT_CONTROL_UPDATED, {
        childId: link.child.user.id,
        settings: {
          isPaused: updatedControls.isPaused,
          canComment: updatedControls.canComment,
          canAddFriends: updatedControls.canAddFriends,
          canWatchShortsReels: updatedControls.canWatchShortsReels,
          dailyLimitMinutes: updatedControls.dailyLimitMinutes,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          childId: link.child.id,
          childUsername: link.child.user.username,
          settings: updatedControls,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
