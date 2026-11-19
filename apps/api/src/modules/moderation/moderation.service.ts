import { ContentStatus, ReviewDecision, AgeGroup, Prisma } from '../../generated/prisma-client/index.js';
import { prisma } from '../../prisma.js';
import { getStorageProvider } from '../media/storage.factory.js';
import { RealtimeServer } from '../realtime/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';

export interface ModerationTransitionResult {
  contentId: string;
  previousStatus: ContentStatus;
  newStatus: ContentStatus;
  actionId: string;
  reviewId?: string;
}

export class ModerationService {
  /**
   * Allowed state machine transitions for Content Lifecycle.
   * DRAFT -> PENDING_REVIEW -> UNDER_REVIEW -> APPROVED -> PUBLISHED
   * Divergent: REJECTED, CHANGES_REQUESTED, REMOVED
   */
  private static readonly VALID_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
    DRAFT: [ContentStatus.PENDING_REVIEW],
    PENDING_REVIEW: [
      ContentStatus.UNDER_REVIEW,
      ContentStatus.APPROVED,
      ContentStatus.REJECTED,
      ContentStatus.CHANGES_REQUESTED,
      ContentStatus.REMOVED,
    ],
    UNDER_REVIEW: [
      ContentStatus.APPROVED,
      ContentStatus.REJECTED,
      ContentStatus.CHANGES_REQUESTED,
      ContentStatus.REMOVED,
      ContentStatus.PENDING_REVIEW, // can put back into queue
    ],
    CHANGES_REQUESTED: [ContentStatus.PENDING_REVIEW, ContentStatus.REMOVED],
    APPROVED: [ContentStatus.PUBLISHED, ContentStatus.REMOVED],
    PUBLISHED: [ContentStatus.REMOVED],
    REJECTED: [ContentStatus.PENDING_REVIEW, ContentStatus.REMOVED], // creator can re-submit after revisions
    REMOVED: [],
  };

  /**
   * Validates if a transition from previousStatus to newStatus is permissible.
   */
  public static isValidTransition(from: ContentStatus, to: ContentStatus): boolean {
    return this.VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Atomically claims a pending content item for review by an administrator.
   */
  public static async claimForReview(contentId: string, adminId: string) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const content = await tx.content.findUnique({
        where: { id: contentId },
        include: { author: true },
      });

      if (!content) {
        throw new Error('Content not found.');
      }

      // Self-approval / self-review prevention rule:
      if (content.authorId === adminId) {
        throw new Error('Administrator cannot review or claim their own submitted content.');
      }

      if (
        content.status !== ContentStatus.PENDING_REVIEW &&
        content.status !== ContentStatus.UNDER_REVIEW
      ) {
        throw new Error(`Content cannot be claimed in status ${content.status}.`);
      }

      if (content.status === ContentStatus.PENDING_REVIEW) {
        await tx.content.update({
          where: { id: contentId },
          data: { status: ContentStatus.UNDER_REVIEW },
        });

        await tx.moderationAction.create({
          data: {
            contentId,
            adminId,
            actionType: 'CLAIM_REVIEW',
            previousStatus: ContentStatus.PENDING_REVIEW,
            newStatus: ContentStatus.UNDER_REVIEW,
            reason: 'Administrator opened item for active review inspection.',
          },
        });
      }

      return content;
    });
  }

  /**
   * Executes a formal review decision (APPROVE, REJECT, REQUEST_CHANGES).
   * Runs in a strict database transaction.
   */
  public static async makeDecision(params: {
    contentId: string;
    adminId: string;
    decision: ReviewDecision;
    approvedAudiences?: AgeGroup[];
    reason?: string;
    internalNotes?: string;
    ipAddress?: string;
  }): Promise<ModerationTransitionResult> {
    const { contentId, adminId, decision, approvedAudiences, reason, internalNotes } = params;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Fetch content with relations
      const content = await tx.content.findUnique({
        where: { id: contentId },
        include: {
          author: true,
          requestedAudiences: true,
          mediaAssets: true,
          submissions: { orderBy: { submittedAt: 'desc' }, take: 1 },
        },
      });

      if (!content) {
        throw new Error('Content item not found.');
      }

      // 2. Prevent self-approval
      if (content.authorId === adminId) {
        throw new Error('Conflict of interest: Administrators cannot moderate their own content.');
      }

      const prevStatus = content.status;
      let newStatus: ContentStatus;

      if (decision === ReviewDecision.APPROVE) {
        newStatus = ContentStatus.APPROVED;
      } else if (decision === ReviewDecision.REJECT) {
        newStatus = ContentStatus.REJECTED;
      } else {
        newStatus = ContentStatus.CHANGES_REQUESTED;
      }

      // 3. State transition validity
      if (!this.isValidTransition(prevStatus, newStatus)) {
        throw new Error(
          `Invalid state transition: Cannot transition from ${prevStatus} to ${newStatus}.`
        );
      }

      // 4. Handle audience rules per content type
      if (decision === ReviewDecision.APPROVE) {
        if (content.type === 'POST') {
          // Rule: Posts do not require creator selection and are approved across all tiers by default
          // unless specified by admin
          const finalPostAudiences =
            approvedAudiences && approvedAudiences.length > 0
              ? approvedAudiences
              : [AgeGroup.JUNIOR, AgeGroup.EXPLORER, AgeGroup.TEEN];

          // Delete existing approved audiences if re-evaluating
          await tx.contentApprovedAudience.deleteMany({ where: { contentId } });
          await tx.contentApprovedAudience.createMany({
            data: finalPostAudiences.map((tier) => ({
              contentId,
              ageGroup: tier,
            })),
          });
        } else if (content.type === 'SHORT' || content.type === 'REEL') {
          // Rule: For Shorts/Reels, the admin selects the final audience from requested audiences
          const requestedTiers = content.requestedAudiences.map((r) => r.ageGroup);

          if (!approvedAudiences || approvedAudiences.length === 0) {
            throw new Error(
              'Administrator must select at least one approved audience tier for Shorts and Reels.'
            );
          }

          // Safety validation: The admin must not approve an audience the creator did not request
          // without explicit verification
          for (const targetTier of approvedAudiences) {
            if (!requestedTiers.includes(targetTier)) {
              throw new Error(
                `Safety violation: Tier "${targetTier}" was not in creator's requested audiences (${requestedTiers.join(
                  ', '
                )}).`
              );
            }
          }

          await tx.contentApprovedAudience.deleteMany({ where: { contentId } });
          await tx.contentApprovedAudience.createMany({
            data: approvedAudiences.map((tier) => ({
              contentId,
              ageGroup: tier,
            })),
          });
        }

        // Special handling for profile photos & bios
        if (content.type === 'PROFILE_PHOTO') {
          const mainAsset = content.mediaAssets[0];
          if (mainAsset) {
            await tx.user.update({
              where: { id: content.authorId },
              data: {
                avatarUrl: mainAsset.url,
                pendingAvatarUrl: null,
              },
            });
          }
        } else if (content.type === 'PROFILE_BIO') {
          if (content.caption) {
            await tx.user.update({
              where: { id: content.authorId },
              data: {
                bio: content.caption,
                pendingBio: null,
              },
            });
          }
        }

        // Un-quarantine media assets upon approval
        if (content.mediaAssets.length > 0) {
          const storage = getStorageProvider();
          for (const asset of content.mediaAssets) {
            if (asset.isQuarantined) {
              const approvedKey = asset.storageKey.replace(/^quarantine\//, 'approved/');
              const publicUrl = await storage
                .promoteToApproved(asset.storageKey, approvedKey)
                .catch(() => asset.url);

              await tx.mediaAsset.update({
                where: { id: asset.id },
                data: {
                  isQuarantined: false,
                  storageKey: approvedKey,
                  url: publicUrl,
                },
              });
            }
          }
        }
      }

      // 5. Update content status
      await tx.content.update({
        where: { id: contentId },
        data: { status: newStatus },
      });

      // 6. Ensure a submission record exists to link the review
      let submissionId = content.submissions[0]?.id;
      if (!submissionId) {
        const sub = await tx.contentSubmission.create({
          data: {
            contentId,
            submittedById: content.authorId,
            notes: 'Auto-registered submission entry',
          },
        });
        submissionId = sub.id;
      }

      // 7. Record immutable ContentReview
      const review = await tx.contentReview.create({
        data: {
          contentId,
          submissionId,
          reviewerId: adminId,
          decision,
          decisionReason: reason || null,
          internalNotes: internalNotes || null, // Never exposed to kids!
        },
      });

      // 8. Record immutable ModerationAction audit log
      const action = await tx.moderationAction.create({
        data: {
          contentId,
          adminId,
          actionType: `DECISION_${decision}`,
          previousStatus: prevStatus,
          newStatus,
          reason: reason || `Decision ${decision} applied by admin.`,
        },
      });

      // 9. Send Kid-Friendly Notification
      let notifTitle = 'Update on your submission';
      let notifMessage = 'Our moderation team reviewed your creation.';

      if (decision === ReviewDecision.APPROVE) {
        notifTitle = 'Your post was approved! 🎉';
        notifMessage = 'Your creation has been verified safe and published for your friends to see!';
      } else if (decision === ReviewDecision.REJECT) {
        notifTitle = 'Content safety notice';
        notifMessage =
          reason || 'Your submission could not be approved due to community safety guidelines.';
      } else if (decision === ReviewDecision.REQUEST_CHANGES) {
        notifTitle = 'Small change needed';
        notifMessage = reason || 'Please revise your submission and try sharing again.';
      }

      const notif = await tx.notification.create({
        data: {
          userId: content.authorId,
          type: decision === ReviewDecision.APPROVE ? 'CONTENT_APPROVED' : 'CONTENT_REJECTED',
          title: notifTitle,
          message: notifMessage,
          referenceId: contentId,
        },
      });

      // Post-transaction real-time event dispatch
      const realtime = RealtimeServer.getInstance();

      // 1. Notify Author
      if (decision === ReviewDecision.APPROVE) {
        realtime.emitToUser(content.authorId, RealtimeEvent.CONTENT_APPROVED, {
          contentId,
          type: content.type,
          title: content.title || 'Untitled',
          approvedAudiences: approvedAudiences || [],
        });
        realtime.emitToUser(content.authorId, RealtimeEvent.NOTIFICATION_CREATED, {
          id: notif.id,
          userId: content.authorId,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          createdAt: notif.createdAt.toISOString(),
        });

        // 2. Broadcast feed update to approved age group rooms
        if (approvedAudiences && approvedAudiences.length > 0) {
          realtime.emitToAgeGroups(approvedAudiences, RealtimeEvent.FEED_UPDATED, {
            type: content.type,
            targetAgeGroups: approvedAudiences,
            action: 'NEW_CONTENT',
          });
        }
      } else if (decision === ReviewDecision.REJECT) {
        realtime.emitToUser(content.authorId, RealtimeEvent.CONTENT_REJECTED, {
          contentId,
          type: content.type,
          reason: reason || 'Community guidelines violation',
        });
        realtime.emitToUser(content.authorId, RealtimeEvent.NOTIFICATION_CREATED, {
          id: notif.id,
          userId: content.authorId,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          createdAt: notif.createdAt.toISOString(),
        });
      } else if (decision === ReviewDecision.REQUEST_CHANGES) {
        realtime.emitToUser(content.authorId, RealtimeEvent.CONTENT_CHANGES_REQUESTED, {
          contentId,
          type: content.type,
          reason: reason || 'Changes requested',
        });
      }

      // 3. Notify Admins moderation queue updated
      realtime.emitToAdmins(RealtimeEvent.MODERATION_QUEUE_UPDATED, {
        action: 'ITEM_REVIEWED',
        contentId,
      });

      return {
        contentId,
        previousStatus: prevStatus,
        newStatus,
        actionId: action.id,
        reviewId: review.id,
      };
    });
  }
}
