import {
  PrismaClient,
  UserRole,
  AgeGroup,
  ContentType,
  ContentStatus,
  ReviewDecision,
  MediaType,
  ParentLinkStatus,
  NotificationType,
} from '@prisma/client';

const prisma = new PrismaClient();

// Helper to compute birthDate from target age in 2026
function getBirthDateForAge(age: number): Date {
  const date = new Date(2026, 0, 1);
  date.setFullYear(2026 - age);
  return date;
}

// Real bcrypt hash for "Password123!" with cost factor 10
const DEMO_PASSWORD_HASH = '$2b$10$dmR0mkW8EqvpMeX/5mAVpOo/oVOXWsjoeyLtDn0jK/DBbpbP/kSHa';

async function main() {
  console.log('[Seed] Starting database seeding for Fizzy...');

  // 1. Clean existing records in reverse dependency order
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.contentReport.deleteMany(),
    prisma.moderationAction.deleteMany(),
    prisma.contentReview.deleteMany(),
    prisma.contentSubmission.deleteMany(),
    prisma.contentApprovedAudience.deleteMany(),
    prisma.contentRequestedAudience.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.reaction.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.content.deleteMany(),
    prisma.friendship.deleteMany(),
    prisma.friendRequest.deleteMany(),
    prisma.blockedUser.deleteMany(),
    prisma.parentControl.deleteMany(),
    prisma.parentChildLink.deleteMany(),
    prisma.childProfile.deleteMany(),
    prisma.parentProfile.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log('[Seed] Database cleaned.');

  // 2. Create Platform Administrator (Demo)
  const adminUser = await prisma.user.create({
    data: {
      username: 'safety_admin',
      displayName: 'Captain Moderator',
      email: 'admin@fizzy.local',
      passwordHash: DEMO_PASSWORD_HASH,
      role: UserRole.ADMIN,
      isVerified: true,
      bio: 'Fizzy Safety Team Administrator & Chief Content Guardian',
    },
  });

  // 3. Create Parent (Demo)
  const parentUser = await prisma.user.create({
    data: {
      username: 'guardian_sarah',
      displayName: 'Sarah Guardian',
      email: 'parent.sarah@fizzy.local',
      passwordHash: DEMO_PASSWORD_HASH,
      role: UserRole.PARENT,
      isVerified: true,
      parentProfile: {
        create: {
          phoneNumber: '+1-555-0199',
        },
      },
    },
    include: {
      parentProfile: true,
    },
  });

  const parentProfileId = parentUser.parentProfile!.id;

  // 4. Create Junior Child (Age 7, JUNIOR tier)
  const juniorChild = await prisma.user.create({
    data: {
      username: 'leo_lion_7',
      displayName: 'Leo The Lion',
      passwordHash: DEMO_PASSWORD_HASH,
      role: UserRole.CHILD,
      ageGroup: AgeGroup.JUNIOR,
      birthDate: getBirthDateForAge(7),
      bio: 'I like drawing space rockets and building blocks! 🚀',
      childProfile: {
        create: {
          parentLinkCode: 'LINK-LEO-JUNIOR-2026',
          parentLinks: {
            create: {
              parentId: parentProfileId,
              status: ParentLinkStatus.CONFIRMED,
              confirmedAt: new Date(),
            },
          },
          parentControls: {
            create: {
              dailyLimitMinutes: 45,
              canWatchShortsReels: true,
              canCreateContent: true,
              canComment: false, // Junior tier: text comments disabled by parent
              canAddFriends: true,
              requireParentApprovalForFriends: true,
            },
          },
        },
      },
    },
    include: { childProfile: true },
  });

  // 5. Create Explorer Child (Age 10, EXPLORER tier)
  const explorerChild = await prisma.user.create({
    data: {
      username: 'maya_explorer',
      displayName: 'Maya Science Explorer',
      passwordHash: DEMO_PASSWORD_HASH,
      role: UserRole.CHILD,
      ageGroup: AgeGroup.EXPLORER,
      birthDate: getBirthDateForAge(10),
      bio: 'Junior robotics enthusiast and dinosaur researcher 🦖🤖',
      childProfile: {
        create: {
          parentLinkCode: 'LINK-MAYA-EXPLORER-2026',
          parentLinks: {
            create: {
              parentId: parentProfileId,
              status: ParentLinkStatus.CONFIRMED,
              confirmedAt: new Date(),
            },
          },
          parentControls: {
            create: {
              dailyLimitMinutes: 60,
              canWatchShortsReels: true,
              canCreateContent: true,
              canComment: true,
              canAddFriends: true,
              requireParentApprovalForFriends: false,
            },
          },
        },
      },
    },
    include: { childProfile: true },
  });

  // 6. Create Teen Child (Age 15, TEEN tier)
  const teenChild = await prisma.user.create({
    data: {
      username: 'jordan_teen_skater',
      displayName: 'Jordan Skates',
      passwordHash: DEMO_PASSWORD_HASH,
      role: UserRole.CHILD,
      ageGroup: AgeGroup.TEEN,
      birthDate: getBirthDateForAge(15),
      bio: 'Skateboarding clips, coding in Python, indie rock 🛹🎵',
      childProfile: {
        create: {
          parentLinkCode: 'LINK-JORDAN-TEEN-2026',
          parentLinks: {
            create: {
              parentId: parentProfileId,
              status: ParentLinkStatus.CONFIRMED,
              confirmedAt: new Date(),
            },
          },
          parentControls: {
            create: {
              dailyLimitMinutes: 120,
              canWatchShortsReels: true,
              canCreateContent: true,
              canComment: true,
              canAddFriends: true,
              requireParentApprovalForFriends: false,
            },
          },
        },
      },
    },
    include: { childProfile: true },
  });

  console.log('[Seed] Users and profiles created successfully.');

  // 7. Friendship & Social Graph between Explorer and Teen
  const [userA, userB] = [explorerChild.id, teenChild.id].sort();
  await prisma.friendship.create({
    data: {
      userAId: userA,
      userBId: userB,
    },
  });

  // 8. Photo Post by Leo (Junior) — Approved
  // Business Rule: Posts require NO creator audience selection.
  // When approved, admin assigns audiences (available across JUNIOR, EXPLORER, TEEN).
  const juniorPost = await prisma.content.create({
    data: {
      authorId: juniorChild.id,
      type: ContentType.POST,
      status: ContentStatus.APPROVED,
      caption: 'Look at my colorful clay dinosaur! 🦕✨',
      mediaAssets: {
        create: {
          mediaType: MediaType.IMAGE,
          storageKey: 'media/approved/leo_clay_dino.jpg',
          url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600',
          mimeType: 'image/jpeg',
          fileSizeBytes: 245000,
          isQuarantined: false,
        },
      },
      approvedAudiences: {
        createMany: {
          data: [
            { ageGroup: AgeGroup.JUNIOR },
            { ageGroup: AgeGroup.EXPLORER },
            { ageGroup: AgeGroup.TEEN },
          ],
        },
      },
      reactions: {
        createMany: {
          data: [
            { userId: explorerChild.id, emoji: '❤️' },
            { userId: teenChild.id, emoji: '🎉' },
          ],
        },
      },
    },
  });

  const juniorSubmission = await prisma.contentSubmission.create({
    data: {
      contentId: juniorPost.id,
      submittedById: juniorChild.id,
      notes: 'Junior photo submission',
    },
  });

  await prisma.contentReview.create({
    data: {
      contentId: juniorPost.id,
      submissionId: juniorSubmission.id,
      reviewerId: adminUser.id,
      decision: ReviewDecision.APPROVE,
      decisionReason: 'Wholesome clay sculpture photo. Safe for all audiences.',
    },
  });

  await prisma.moderationAction.create({
    data: {
      contentId: juniorPost.id,
      adminId: adminUser.id,
      actionType: 'APPROVE',
      previousStatus: ContentStatus.PENDING_REVIEW,
      newStatus: ContentStatus.APPROVED,
      reason: 'Wholesome artwork. Safe for all children.',
    },
  });

  // 9. Video Reel by Jordan (Teen) — Creator requested: JUNIOR + EXPLORER + TEEN; Admin approved: TEEN only.
  // Strict Business Rule demonstration: Original requested audiences preserved!
  const teenReel = await prisma.content.create({
    data: {
      authorId: teenChild.id,
      type: ContentType.REEL,
      status: ContentStatus.APPROVED,
      title: 'Advanced Kickflip Tutorial in Slow Motion',
      caption: 'Step-by-step skateboard flip tricks. Wear a helmet! 🛹⚡',
      durationSeconds: 42,
      mediaAssets: {
        createMany: {
          data: [
            {
              mediaType: MediaType.VIDEO,
              storageKey: 'media/approved/kickflip_slowmo.mp4',
              url: 'https://assets.mixkit.co/videos/preview/mixkit-skater-doing-tricks-in-a-skatepark-42655-large.mp4',
              mimeType: 'video/mp4',
              fileSizeBytes: 3500000,
              durationSeconds: 42,
              isQuarantined: false,
            },
            {
              mediaType: MediaType.THUMBNAIL,
              storageKey: 'media/approved/kickflip_thumb.jpg',
              url: 'https://images.unsplash.com/photo-1520045892732-304bc3ac5d8e?w=600',
              mimeType: 'image/jpeg',
              fileSizeBytes: 85000,
              isQuarantined: false,
            },
          ],
        },
      },
      // Creator requested: ALL THREE TIERS
      requestedAudiences: {
        createMany: {
          data: [
            { ageGroup: AgeGroup.JUNIOR },
            { ageGroup: AgeGroup.EXPLORER },
            { ageGroup: AgeGroup.TEEN },
          ],
        },
      },
      // Admin sovereign decision: TEEN ONLY (too fast/advanced for 6-8 yr juniors)
      approvedAudiences: {
        createMany: {
          data: [{ ageGroup: AgeGroup.TEEN }],
        },
      },
    },
  });

  const teenSubmission = await prisma.contentSubmission.create({
    data: {
      contentId: teenReel.id,
      submittedById: teenChild.id,
      notes: 'Skate trick breakdown',
    },
  });

  await prisma.contentReview.create({
    data: {
      contentId: teenReel.id,
      submissionId: teenSubmission.id,
      reviewerId: adminUser.id,
      decision: ReviewDecision.APPROVE,
      decisionReason: 'High kinetic activity; approved strictly for TEEN tier.',
      internalNotes: 'Downgraded from requested JUNIOR/EXPLORER due to injury risk without proper gear.',
    },
  });

  await prisma.moderationAction.create({
    data: {
      contentId: teenReel.id,
      adminId: adminUser.id,
      actionType: 'APPROVE_RESTRICTED',
      previousStatus: ContentStatus.PENDING_REVIEW,
      newStatus: ContentStatus.APPROVED,
      reason: 'Audience restricted to TEEN only per safety guidelines.',
    },
  });

  // 10. Pending Content in Queue (Maya Explorer) — Waiting for Admin Review
  const pendingShort = await prisma.content.create({
    data: {
      authorId: explorerChild.id,
      type: ContentType.SHORT,
      status: ContentStatus.PENDING_REVIEW,
      title: 'Our Lego Mars Rover in Action!',
      caption: 'Testing the solar panels on Mars rocks 🛸',
      durationSeconds: 24,
      mediaAssets: {
        create: {
          mediaType: MediaType.VIDEO,
          storageKey: 'media/quarantine/mars_rover.mp4',
          url: 'https://assets.mixkit.co/videos/preview/mixkit-little-girl-playing-with-toys-41221-large.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1800000,
          durationSeconds: 24,
          isQuarantined: true, // Still quarantined in private storage!
        },
      },
      requestedAudiences: {
        createMany: {
          data: [
            { ageGroup: AgeGroup.JUNIOR },
            { ageGroup: AgeGroup.EXPLORER },
          ],
        },
      },
    },
  });

  await prisma.contentSubmission.create({
    data: {
      contentId: pendingShort.id,
      submittedById: explorerChild.id,
      notes: 'Submitted for safe review',
    },
  });

  // 11. Notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: juniorChild.id,
        type: NotificationType.CONTENT_APPROVED,
        title: 'Post Approved! 🎉',
        message: 'Your clay dinosaur photo was approved by our moderators and is now visible to friends.',
        referenceId: juniorPost.id,
      },
      {
        userId: parentUser.id,
        type: NotificationType.PARENT_ALERT,
        title: 'Activity Notice',
        message: 'Leo posted a new approved photo: "Look at my colorful clay dinosaur!".',
        referenceId: juniorPost.id,
      },
      {
        userId: adminUser.id,
        type: NotificationType.CONTENT_SUBMITTED,
        title: 'New Content in Moderation Queue',
        message: 'Maya Science Explorer submitted a short video awaiting review.',
        referenceId: pendingShort.id,
      },
    ],
  });

  // 12. Audit Log
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: adminUser.id,
        action: 'CONTENT_MODERATION_APPROVE',
        entityType: 'Content',
        entityId: juniorPost.id,
        details: { audiencesApproved: ['JUNIOR', 'EXPLORER', 'TEEN'] },
      },
      {
        actorId: adminUser.id,
        action: 'CONTENT_MODERATION_AUDIENCE_OVERRIDE',
        entityType: 'Content',
        entityId: teenReel.id,
        details: {
          requestedAudiences: ['JUNIOR', 'EXPLORER', 'TEEN'],
          approvedAudiences: ['TEEN'],
          reason: 'Downgraded to TEEN tier for physical safety awareness.',
        },
      },
    ],
  });

  console.log('[Seed] Database successfully populated with realistic, safe mock data!');
}

main()
  .catch((e) => {
    console.error('[Seed Error]:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
