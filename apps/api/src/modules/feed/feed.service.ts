import { AgeGroup, ContentStatus, ContentType, Prisma } from '../../generated/prisma-client/index.js';
import { prisma } from '../../prisma.js';

export interface FeedQueryParams {
  userRole: string;
  userAgeGroup?: AgeGroup | null;
  userId?: string;
  page?: number;
  limit?: number;
  contentType?: ContentType;
}

export class FeedService {
  /**
   * Builds the strict Prisma WHERE clause enforcing:
   * 1. Status is APPROVED or PUBLISHED (never DRAFT, PENDING_REVIEW, REJECTED, REMOVED).
   * 2. Age-group visibility:
   *    - For POST: Available across all approved posts.
   *    - For SHORT & REEL: Strictly requires that approvedAudiences includes the user's ageGroup.
   * 3. Excludes content from blocked users if userId is provided.
   */
  public static buildVisibilityWhereClause(params: {
    userRole: string;
    userAgeGroup?: AgeGroup | null;
    userId?: string;
    contentType?: ContentType;
  }): Prisma.ContentWhereInput {
    const { userRole, userAgeGroup, userId, contentType } = params;

    // Base status filter: only APPROVED or PUBLISHED
    const statusFilter: Prisma.ContentWhereInput = {
      status: {
        in: [ContentStatus.APPROVED, ContentStatus.PUBLISHED],
      },
    };

    // If caller is an administrator, they can view approved feeds, but we still respect age tiers if filtering
    const ageFilter: Prisma.ContentWhereInput = {};

    if (userRole === 'CHILD' && userAgeGroup) {
      // Content is visible if:
      // (type == POST AND approvedAudiences has userAgeGroup) OR
      // ((type == SHORT OR type == REEL) AND approvedAudiences has userAgeGroup)
      // Since posts are given all 3 approvedAudiences upon approval, filtering by
      // approvedAudiences matching userAgeGroup works uniformly and performantly via relational indexes!
      ageFilter.approvedAudiences = {
        some: {
          ageGroup: userAgeGroup,
        },
      };
    }

    // Exclude content from blocked users if a child/user has blocked or been blocked by the author
    const blockFilter: Prisma.ContentWhereInput = {};
    if (userId) {
      blockFilter.author = {
        blockedUsers: {
          none: {
            blockedId: userId,
          },
        },
        blockedBy: {
          none: {
            blockerId: userId,
          },
        },
      };
    }

    const typeFilter: Prisma.ContentWhereInput = contentType ? { type: contentType } : {};

    return {
      AND: [statusFilter, ageFilter, blockFilter, typeFilter],
    };
  }

  /**
   * Retrieves paginated feed items meeting strict visibility rules.
   */
  public static async getFeed(params: FeedQueryParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where = this.buildVisibilityWhereClause({
      userRole: params.userRole,
      userAgeGroup: params.userAgeGroup,
      userId: params.userId,
      contentType: params.contentType,
    });

    const [items, total] = await Promise.all([
      prisma.content.findMany({
        where,
        skip,
        take: limit,
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
          mediaAssets: {
            where: { isQuarantined: false },
          },
          approvedAudiences: {
            select: { ageGroup: true },
          },
          _count: {
            select: {
              comments: { where: { status: ContentStatus.APPROVED } },
              reactions: true,
            },
          },
        },
      }),
      prisma.content.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        title: item.title,
        caption: item.caption,
        durationSeconds: item.durationSeconds,
        author: item.author,
        mediaAssets: item.mediaAssets,
        approvedAudiences: item.approvedAudiences.map((a) => a.ageGroup),
        commentCount: item._count.comments,
        reactionCount: item._count.reactions,
        createdAt: item.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Verifies whether a specific content item is visible to the given user.
   * Throws or returns null if not accessible.
   */
  public static async getContentById(params: {
    contentId: string;
    userRole: string;
    userAgeGroup?: AgeGroup | null;
    userId?: string;
  }) {
    const { contentId, userRole, userAgeGroup, userId } = params;

    const content = await prisma.content.findUnique({
      where: { id: contentId },
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
        mediaAssets: true,
        approvedAudiences: true,
        requestedAudiences: true,
        _count: {
          select: {
            comments: { where: { status: ContentStatus.APPROVED } },
            reactions: true,
          },
        },
      },
    });

    if (!content) {
      return null;
    }

    // Admins can inspect any content directly
    if (userRole === 'ADMIN') {
      return content;
    }

    // Authors can view their own content (even when pending or rejected)
    if (userId && content.authorId === userId) {
      return content;
    }

    // 1. Must be APPROVED or PUBLISHED
    if (
      content.status !== ContentStatus.APPROVED &&
      content.status !== ContentStatus.PUBLISHED
    ) {
      return null;
    }

    // 2. Age-group visibility check for children
    if (userRole === 'CHILD' && userAgeGroup) {
      const isAudienceApproved = content.approvedAudiences.some(
        (a) => a.ageGroup === userAgeGroup
      );

      if (!isAudienceApproved) {
        return null; // Denied: Not approved for this child's developmental tier
      }
    }

    return content;
  }
}
