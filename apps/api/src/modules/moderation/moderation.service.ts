import { ContentStatus, ReviewDecision, AgeGroup, Prisma } from '../../generated/prisma-client/index.js';
import { prisma } from '../../prisma.js';
import { getStorageProvider } from '../media/storage.factory.js';
import { RealtimeServer, OutboxService } from '../realtime/index.js';
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

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
      let finalAudiencesToStore: AgeGroup[] = [];

      if (decision === ReviewDecision.APPROVE) {
        if (content.type === 'POST') {
          // Rule: Posts do not require creator selection and are approved across all tiers by default
          // unless specified by admin
          finalAudiencesToStore =
            approvedAudiences && approvedAudiences.length > 0
              ? approvedAudiences
              : [AgeGroup.JUNIOR, AgeGroup.EXPLORER, AgeGroup.TEEN];

          // Delete existing approved audiences if re-evaluating
          await tx.contentApprovedAudience.deleteMany({ where: { contentId } });
          await tx.contentApprovedAudience.createMany({
            data: finalAudiencesToStore.map((tier) => ({
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

          finalAudiencesToStore = approvedAudiences;

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

      // 4b. Special handling for COMMENT content type
      let approvedCommentData: {
        id: string;
        contentId: string;
        text: string;
        author: {
          id: string;
          username: string;
          displayName: string;
          avatarUrl: string | null;
          ageGroup: string | null;
        };
        createdAt: string;
        targetAgeGroups: AgeGroup[];
      } | null = null;

      if (content.type === 'COMMENT') {
        const commentStatus =
          decision === ReviewDecision.APPROVE
            ? ContentStatus.APPROVED
            : decision === ReviewDecision.REJECT
            ? ContentStatus.REJECTED
            : ContentStatus.PENDING_REVIEW;

        // Extract parent contentId from submissions notes (e.g. "Comment on content <contentId>")
        const subNotes = content.submissions[0]?.notes || '';
        const match = subNotes.match(/Comment on content ([a-zA-Z0-9_-]+)/);
        const parentContentId = match ? match[1] : null;

        const targetComment = await tx.comment.findFirst({
          where: {
            authorId: content.authorId,
            ...(parentContentId ? { contentId: parentContentId } : {}),
            status: ContentStatus.PENDING_REVIEW,
          },
          orderBy: { createdAt: 'desc' },
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
        });

        if (targetComment) {
          await tx.comment.update({
            where: { id: targetComment.id },
            data: { status: commentStatus },
          });

          if (decision === ReviewDecision.APPROVE) {
            // Find parent content's approved audiences
            const parentContent = await tx.content.findUnique({
              where: { id: targetComment.contentId },
              include: { approvedAudiences: true },
            });

            const parentAudiences =
              parentContent && parentContent.approvedAudiences.length > 0
                ? parentContent.approvedAudiences.map((a) => a.ageGroup)
                : [AgeGroup.JUNIOR, AgeGroup.EXPLORER, AgeGroup.TEEN];

            approvedCommentData = {
              id: targetComment.id,
              contentId: targetComment.contentId,
              text: targetComment.text,
              author: targetComment.author,
              createdAt: targetComment.createdAt.toISOString(),
              targetAgeGroups: parentAudiences,
            };
          }
        }
      }

      // 5. Update content status
      await tx.content.update({
        where: { id: contentId },
        data: {
          status: newStatus,
        },
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
          type:
            decision === ReviewDecision.APPROVE
              ? 'CONTENT_APPROVED'
              : decision === ReviewDecision.REQUEST_CHANGES
              ? 'SYSTEM_ALERT'
              : 'CONTENT_REJECTED',
          title: notifTitle,
          message: notifMessage,
          referenceId: contentId,
        },
      });

      // Deliver database notification to user
      await OutboxService.enqueue(tx, {
        eventType: RealtimeEvent.NOTIFICATION_CREATED,
        channelType: 'USER',
        target: `user:${content.authorId}`,
        payload: {
          id: notif.id,
          userId: content.authorId,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          referenceId: notif.referenceId,
          createdAt: notif.createdAt.toISOString(),
        },
      });

      // 10. Enqueue events into transactional outbox
      if (decision === ReviewDecision.APPROVE) {
        await OutboxService.enqueue(tx, {
          eventType: RealtimeEvent.CONTENT_APPROVED,
          channelType: 'USER',
          target: `user:${content.authorId}`,
          payload: {
            contentId,
            type: content.type,
            title: content.title || 'Untitled',
            approvedAudiences: finalAudiencesToStore,
          },
        });

        // Enqueue feed update for each verified approved audience
        for (const tier of finalAudiencesToStore) {
          await OutboxService.enqueue(tx, {
            eventType: RealtimeEvent.FEED_UPDATED,
            channelType: 'AGE_GROUP',
            target: tier,
            payload: {
              type: content.type,
              targetAgeGroups: finalAudiencesToStore,
              action: 'NEW_CONTENT',
            },
          });
        }

        // If approved a comment, enqueue COMMENT_APPROVED event for the parent content audiences
        if (approvedCommentData) {
          for (const tier of approvedCommentData.targetAgeGroups) {
            await OutboxService.enqueue(tx, {
              eventType: RealtimeEvent.COMMENT_APPROVED,
              channelType: 'AGE_GROUP',
              target: tier,
              payload: {
                commentId: approvedCommentData.id,
                contentId: approvedCommentData.contentId,
                text: approvedCommentData.text,
                author: approvedCommentData.author,
                createdAt: approvedCommentData.createdAt,
              },
            });
          }
        }
      } else if (decision === ReviewDecision.REJECT) {
        await OutboxService.enqueue(tx, {
          eventType: RealtimeEvent.CONTENT_REJECTED,
          channelType: 'USER',
          target: `user:${content.authorId}`,
          payload: {
            contentId,
            type: content.type,
            reason: reason || 'Community guidelines violation',
          },
        });
      } else if (decision === ReviewDecision.REQUEST_CHANGES) {
        await OutboxService.enqueue(tx, {
          eventType: RealtimeEvent.CONTENT_CHANGES_REQUESTED,
          channelType: 'USER',
          target: `user:${content.authorId}`,
          payload: {
            contentId,
            type: content.type,
            reason: reason || 'Changes requested',
          },
        });
      }

      await OutboxService.enqueue(tx, {
        eventType: RealtimeEvent.MODERATION_QUEUE_UPDATED,
        channelType: 'ADMIN',
        target: 'role:admin',
        payload: {
          action: 'ITEM_REVIEWED',
          contentId,
        },
      });

      return {
        contentId,
        previousStatus: prevStatus,
        newStatus,
        actionId: action.id,
        reviewId: review.id,
      };
    });

    // 11. Trigger immediate outbox delivery now that database transaction has committed
    await OutboxService.processPendingEvents().catch((err) => {
      console.error('[Moderation] Error delivering outbox events:', err);
    });

    // 12. Broadcast updated admin dashboard metrics
    try {
      const { AdminMetricsService } = await import('../admin/index.js');
      await AdminMetricsService.broadcastMetrics(`DECISION_${decision}`);
    } catch (e) {
      console.error('[Moderation] Error broadcasting metrics:', e);
    }

    return result;
  }
}
