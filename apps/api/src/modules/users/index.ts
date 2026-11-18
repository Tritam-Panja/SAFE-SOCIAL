import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { updateBioInputSchema, updateAvatarInputSchema, updateDisplayNameSchema, UpdateBioInput, UpdateAvatarInput, UpdateDisplayNameInput } from '@fizzy/validation';
import { ContentStatus, ContentType } from '../../generated/prisma-client/index.js';

export const usersRouter = Router();

/**
 * GET /api/v1/users/profile/:username
 * Public safe profile lookup: Only permitted non-PII details are exposed.
 */
usersRouter.get(
  '/profile/:username',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { username: req.params.username },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          role: true,
          ageGroup: true,
          createdAt: true,
          _count: {
            select: {
              contents: { where: { status: ContentStatus.APPROVED } },
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'User not found.' } });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          ageGroup: user.ageGroup,
          totalApprovedCreations: user._count.contents,
          memberSince: user.createdAt,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/users/display-name
 * Update display name directly.
 */
usersRouter.put(
  '/display-name',
  requireAuth,
  validateRequest(updateDisplayNameSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { displayName } = req.body as UpdateDisplayNameInput;

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { displayName },
        select: { id: true, username: true, displayName: true },
      });

      res.status(200).json({ success: true, data: updated, error: null });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/users/bio
 * Submit a bio change.
 * RULE: Previous approved bio remains active while pendingBio awaits admin review.
 */
usersRouter.put(
  '/bio',
  requireAuth,
  validateRequest(updateBioInputSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { bio } = req.body as UpdateBioInput;

      await prisma.$transaction(async (tx) => {
        // Save to pendingBio without changing active bio
        await tx.user.update({
          where: { id: user.id },
          data: { pendingBio: bio },
        });

        // Enqueue to moderation system
        const modContent = await tx.content.create({
          data: {
            authorId: user.id,
            type: ContentType.PROFILE_BIO,
            status: ContentStatus.PENDING_REVIEW,
            caption: bio,
          },
        });

        await tx.contentSubmission.create({
          data: {
            contentId: modContent.id,
            submittedById: user.id,
            notes: 'Profile bio update',
          },
        });
      });

      res.status(200).json({
        success: true,
        data: {
          currentBio: user.bio,
          pendingBio: bio,
          message: 'Bio update submitted for moderation. Your current bio remains active until approved.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/users/avatar
 * Submit a profile avatar change.
 * RULE: Previous avatar remains active while pendingAvatarUrl awaits admin review.
 */
usersRouter.put(
  '/avatar',
  requireAuth,
  validateRequest(updateAvatarInputSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { mediaAssetId } = req.body as UpdateAvatarInput;

      const mediaAsset = await prisma.mediaAsset.findUnique({
        where: { id: mediaAssetId },
      });

      if (!mediaAsset || !mediaAsset.storageKey.includes(user.id)) {
        res.status(403).json({
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'You can only use your uploaded media.' },
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { pendingAvatarUrl: mediaAsset.url },
        });

        const modContent = await tx.content.create({
          data: {
            authorId: user.id,
            type: ContentType.PROFILE_PHOTO,
            status: ContentStatus.PENDING_REVIEW,
          },
        });

        await tx.mediaAsset.update({
          where: { id: mediaAsset.id },
          data: { contentId: modContent.id },
        });

        await tx.contentSubmission.create({
          data: {
            contentId: modContent.id,
            submittedById: user.id,
            notes: 'Profile avatar photo update',
          },
        });
      });

      res.status(200).json({
        success: true,
        data: {
          currentAvatarUrl: user.avatarUrl,
          pendingAvatarUrl: mediaAsset.url,
          message: 'Profile photo submitted for moderation. Your current avatar remains active until approved.',
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);
