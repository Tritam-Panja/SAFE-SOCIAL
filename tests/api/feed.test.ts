import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Age-Group Feed & Content Visibility Engine Suite', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4050;
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  let juniorToken: string;   // Leo (Age 7, JUNIOR)
  let explorerToken: string; // Maya (Age 10, EXPLORER)
  let teenToken: string;     // Jordan (Age 15, TEEN)
  let adminToken: string;

  let approvedGeneralPostId: string;
  let approvedTeenOnlyReelId: string;
  let pendingReelId: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // 1. Authenticate Junior Child (Leo)
    const juniorLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    juniorToken = juniorLogin.data.session.token;

    // 2. Authenticate Explorer Child (Maya)
    const explorerLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    explorerToken = explorerLogin.data.session.token;

    // 3. Authenticate Teen Child (Jordan)
    const teenLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'jordan_teen_skater', password: 'Password123!' }),
      })
    ).json();
    teenToken = teenLogin.data.session.token;

    // 4. Authenticate Admin (Captain Moderator)
    const adminLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminLogin.data.session.token;

    // Reset parent controls for test accounts to allow normal feed/reels testing
    await prisma.parentControl.updateMany({
      data: {
        isPaused: false,
        canWatchShortsReels: true,
        canComment: true,
        canCreateContent: true,
        canAddFriends: true,
        canReceiveFriendRequests: true,
      },
    });

    // Find the latest approved post that will appear in the default page 1 (orderBy createdAt desc)
    let post = await prisma.content.findFirst({
      where: { type: 'POST', status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      include: { approvedAudiences: true },
    });
    if (!post) {
      const leo = await prisma.user.findUnique({ where: { username: 'leo_lion_7' } });
      post = await prisma.content.create({
        data: {
          authorId: leo!.id,
          type: 'POST',
          status: 'APPROVED',
          title: 'My Dinosaur Sculpture',
          caption: 'Made with colorful clay!',
          approvedAudiences: {
            create: [
              { ageGroup: 'JUNIOR' },
              { ageGroup: 'EXPLORER' },
              { ageGroup: 'TEEN' },
            ],
          },
        },
        include: { approvedAudiences: true },
      });
    } else if (post.approvedAudiences.length === 0) {
      await prisma.contentApprovedAudience.createMany({
        data: [
          { contentId: post.id, ageGroup: 'JUNIOR' },
          { contentId: post.id, ageGroup: 'EXPLORER' },
          { contentId: post.id, ageGroup: 'TEEN' },
        ],
      });
    }
    approvedGeneralPostId = post.id;

    // b) Approved Reel (Jordan's Kickflip) - requested JUNIOR+EXPLORER+TEEN, but admin approved strictly for TEEN
    const teenReel = await prisma.content.findFirst({
      where: { type: 'REEL', status: 'APPROVED' },
      include: { approvedAudiences: true },
    });
    approvedTeenOnlyReelId = teenReel!.id;

    // c) Pending short video (Maya's Lego Rover) - still in PENDING_REVIEW
    const pendingShort = await prisma.content.findFirst({
      where: { status: 'PENDING_REVIEW' },
    });
    pendingReelId = pendingShort!.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Feed retrieval for Approved Posts: Visible across all three age groups (Junior, Explorer, Teen)', async () => {
    // 1. Junior Feed
    const juniorFeed = await (
      await fetch(`${baseUrl}/feed?type=POST`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(juniorFeed.success).toBe(true);
    const juniorHasPost = juniorFeed.data.some((item: any) => item.id === approvedGeneralPostId);
    expect(juniorHasPost).toBe(true);

    // 2. Explorer Feed
    const explorerFeed = await (
      await fetch(`${baseUrl}/feed?type=POST`, {
        headers: { Authorization: `Bearer ${explorerToken}` },
      })
    ).json();
    expect(explorerFeed.success).toBe(true);
    const explorerHasPost = explorerFeed.data.some((item: any) => item.id === approvedGeneralPostId);
    expect(explorerHasPost).toBe(true);

    // 3. Teen Feed
    const teenFeed = await (
      await fetch(`${baseUrl}/feed?type=POST`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenFeed.success).toBe(true);
    const teenHasPost = teenFeed.data.some((item: any) => item.id === approvedGeneralPostId);
    expect(teenHasPost).toBe(true);
  });

  it('Reels Feed: Demonstrates strict age-group isolation for approved Reels', async () => {
    // In database seed: Jordan requested JUNIOR + EXPLORER + TEEN, but Admin approved ONLY TEEN.

    // 1. Junior should NOT see the reel in their feed
    const juniorReelsFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    const juniorFound = juniorReelsFeed.data.some((item: any) => item.id === approvedTeenOnlyReelId);
    expect(juniorFound).toBe(false);

    // 2. Explorer should NOT see the reel in their feed
    const explorerReelsFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${explorerToken}` },
      })
    ).json();
    const explorerFound = explorerReelsFeed.data.some((item: any) => item.id === approvedTeenOnlyReelId);
    expect(explorerFound).toBe(false);

    // 3. Teen CAN see the reel in their feed
    const teenReelsFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    const teenFound = teenReelsFeed.data.some((item: any) => item.id === approvedTeenOnlyReelId);
    expect(teenFound).toBe(true);
  });

  it('Direct content access GET /contents/:id: Blocks unauthorized age group even when ID is known', async () => {
    // A Junior child attempts to fetch the TEEN-only reel knowing the direct URL/ID
    const juniorDirectAttempt = await fetch(`${baseUrl}/contents/${approvedTeenOnlyReelId}`, {
      headers: { Authorization: `Bearer ${juniorToken}` },
    });

    const juniorBody = await juniorDirectAttempt.json();
    expect(juniorDirectAttempt.status).toBe(404);
    expect(juniorBody.success).toBe(false);
    expect(juniorBody.error.code).toBe('CONTENT_UNAVAILABLE');

    // An Explorer child attempts to fetch the TEEN-only reel directly
    const explorerDirectAttempt = await fetch(`${baseUrl}/contents/${approvedTeenOnlyReelId}`, {
      headers: { Authorization: `Bearer ${explorerToken}` },
    });
    expect(explorerDirectAttempt.status).toBe(404);

    // A Teen child fetches the TEEN-only reel directly -> 200 OK
    const teenDirectAttempt = await fetch(`${baseUrl}/contents/${approvedTeenOnlyReelId}`, {
      headers: { Authorization: `Bearer ${teenToken}` },
    });
    const teenBody = await teenDirectAttempt.json();
    expect(teenDirectAttempt.status).toBe(200);
    expect(teenBody.success).toBe(true);
    expect(teenBody.data.id).toBe(approvedTeenOnlyReelId);
    expect(teenBody.data.approvedAudiences).toContain('TEEN');
  });

  it('Feed and direct lookup strictly exclude PENDING, REJECTED, and REMOVED content from non-authors', async () => {
    // 1. Check feeds: Pending short video must NOT appear in feeds of other children
    const juniorFeed = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    const juniorSeesPending = juniorFeed.data.some((item: any) => item.id === pendingReelId);
    expect(juniorSeesPending).toBe(false);

    // 2. Direct lookup by a different child (Leo attempting to inspect Maya's pending rover video)
    const leoDirectAttempt = await fetch(`${baseUrl}/contents/${pendingReelId}`, {
      headers: { Authorization: `Bearer ${juniorToken}` },
    });
    expect(leoDirectAttempt.status).toBe(404);

    // 3. Admin CAN inspect pending content directly
    const adminDirectAttempt = await fetch(`${baseUrl}/contents/${pendingReelId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminDirectAttempt.status).toBe(200);
    const adminBody = await adminDirectAttempt.json();
    expect(adminBody.data.status).toBe('PENDING_REVIEW');
  });
});
