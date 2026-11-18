import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({
    select: {
      username: true,
      displayName: true,
      role: true,
      ageGroup: true,
      childProfile: {
        select: {
          parentLinkCode: true,
          parentControls: true,
        },
      },
      parentProfile: true,
    },
  });

  const contents = await prisma.content.findMany({
    include: {
      author: { select: { username: true } },
      requestedAudiences: true,
      approvedAudiences: true,
      mediaAssets: true,
      reviews: true,
      moderationActions: true,
    },
  });

  console.log('=== SEEDED USERS ===');
  console.log(JSON.stringify(users, null, 2));

  console.log('=== SEEDED CONTENTS (AUDIENCE SEPARATION & MODERATION) ===');
  console.log(
    JSON.stringify(
      contents.map((c) => ({
        author: c.author.username,
        type: c.type,
        status: c.status,
        captionOrTitle: c.caption || c.title,
        requestedAudiences: c.requestedAudiences.map((r) => r.ageGroup),
        approvedAudiences: c.approvedAudiences.map((a) => a.ageGroup),
        mediaAssets: c.mediaAssets.map((m) => ({
          type: m.mediaType,
          isQuarantined: m.isQuarantined,
        })),
        moderationHistory: c.moderationActions.map((a) => ({
          action: a.actionType,
          from: a.previousStatus,
          to: a.newStatus,
          reason: a.reason,
        })),
      })),
      null,
      2
    )
  );
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
