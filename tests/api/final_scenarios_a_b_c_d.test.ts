import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Prompt 15: Final End-to-End Scenarios Verification Suite (A, B, C, D)', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4098;
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  // Tokens & Accounts
  let juniorToken: string; // Leo (Age 7, JUNIOR)
  let juniorId: string;
  let juniorUsername = 'leo_lion_7';

  let explorerToken: string; // Maya (Age 10, EXPLORER)
  let explorerId: string;
  let explorerUsername = 'maya_explorer';

  let teenToken: string; // Jordan (Age 15, TEEN)
  let teenId: string;
  let teenUsername = 'jordan_teen_skater';

  let parentToken: string; // Sarah (Parent)
  let parentId: string;
  let parentUsername = 'guardian_sarah';

  let adminToken: string; // Captain Moderator (Admin)
  let adminId: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // 1. Authenticate Junior
    const jRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: juniorUsername, password: 'Password123!' }),
      })
    ).json();
    juniorToken = jRes.data.session.token;
    juniorId = jRes.data.user.id;

    // 2. Authenticate Explorer
    const eRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: explorerUsername, password: 'Password123!' }),
      })
    ).json();
    explorerToken = eRes.data.session.token;
    explorerId = eRes.data.user.id;

    // 3. Authenticate Teen
    const tRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: teenUsername, password: 'Password123!' }),
      })
    ).json();
    teenToken = tRes.data.session.token;
    teenId = tRes.data.user.id;

    // 4. Authenticate Parent
    const pRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: parentUsername, password: 'Password123!' }),
      })
    ).json();
    parentToken = pRes.data.session.token;
    parentId = pRes.data.user.id;

    // 5. Authenticate Admin
    const aRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = aRes.data.session.token;
    adminId = aRes.data.user.id;

    // Reset parent controls to clean defaults
    await prisma.parentControl.updateMany({
      data: {
        isPaused: false,
        canAddFriends: true,
        canReceiveFriendRequests: true,
        canComment: true,
        canWatchShortsReels: true,
        canCreateContent: true,
      },
    });
  });

  afterAll(async () => {
    // Reset controls
    await prisma.parentControl.updateMany({
      data: {
        isPaused: false,
        canAddFriends: true,
        canReceiveFriendRequests: true,
        canComment: true,
        canWatchShortsReels: true,
        canCreateContent: true,
      },
    });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // =========================================================================
  // SCENARIO A: Child submits a photo post
  // 1. Child logs in.
  // 2. Child creates a photo post.
  // 3. Post enters pending moderation.
  // 4. Other children cannot see it.
  // 5. Admin reviews and approves it.
  // 6. Post becomes visible to eligible children.
  // =========================================================================
  it('Scenario A: Complete lifecycle of child photo post submission, moderation & discovery', async () => {
    // Step 1: Upload image to quarantine
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const ticketRes = await (
      await fetch(`${baseUrl}/media/upload-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${explorerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'treehouse_drawing.png',
          mimeType: 'image/png',
          fileSizeBytes: samplePng.length,
          mediaType: 'IMAGE',
        }),
      })
    ).json();
    expect(ticketRes.success).toBe(true);

    await fetch(ticketRes.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: samplePng,
    });

    const compRes = await (
      await fetch(`${baseUrl}/media/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${explorerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageKey: ticketRes.data.storageKey,
          mediaType: 'IMAGE',
          fileSizeBytes: samplePng.length,
        }),
      })
    ).json();
    expect(compRes.success).toBe(true);
    const mediaAssetId = compRes.data.mediaAssetId;

    // Step 2 & 3: Child creates a photo post -> Enters PENDING_REVIEW
    const createPostRes = await (
      await fetch(`${baseUrl}/posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${explorerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: 'Building a treehouse with my friends! 🏡',
          mediaAssetId,
        }),
      })
    ).json();
    expect(createPostRes.success).toBe(true);
    expect(createPostRes.data.status).toBe('PENDING_REVIEW');
    const postId = createPostRes.data.id;

    // Step 4: Other children (Leo Junior & Jordan Teen) CANNOT see it
    const leoFeed = await (
      await fetch(`${baseUrl}/feed?type=POST`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(leoFeed.data.some((p: any) => p.id === postId)).toBe(false);

    const teenDirectAttempt = await (
      await fetch(`${baseUrl}/contents/${postId}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenDirectAttempt.success).toBe(false);

    // Step 5: Admin reviews and approves it
    const reviewRes = await (
      await fetch(`${baseUrl}/moderation/decision/${postId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'APPROVE',
          reason: 'Verified safe image; no visible PII.',
          internalNotes: 'Safe for all children.',
        }),
      })
    ).json();
    expect(reviewRes.success).toBe(true);
    expect(reviewRes.data.newStatus).toBe('APPROVED');

    // Step 6: Post becomes visible to eligible children (Junior, Explorer, Teen)
    const leoFeedAfter = await (
      await fetch(`${baseUrl}/feed?type=POST`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(leoFeedAfter.data.some((p: any) => p.id === postId)).toBe(true);

    const teenDirectAfter = await (
      await fetch(`${baseUrl}/contents/${postId}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenDirectAfter.success).toBe(true);
    expect(teenDirectAfter.data.id).toBe(postId);
  });

  // =========================================================================
  // SCENARIO B: Age-group restricted Reel
  // 1. A TEEN child creates a Reel.
  // 2. Creator requests JUNIOR, EXPLORER and TEEN.
  // 3. Reel enters moderation.
  // 4. Admin reviews it.
  // 5. Admin approves TEEN only.
  // 6. TEEN users can see the Reel.
  // 7. JUNIOR users cannot see the Reel.
  // 8. EXPLORER users cannot see the Reel.
  // 9. Direct API requests from unauthorized users are rejected.
  // =========================================================================
  it('Scenario B: Age-group restricted Reel lifecycle and strict tier isolation', async () => {
    // Step 1: Teen uploads video
    const dummyMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
      0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
      0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
    ]);
    const videoTicket = await (
      await fetch(`${baseUrl}/media/upload-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teenToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'advanced_skate_tricks.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: dummyMp4.length,
          mediaType: 'VIDEO',
        }),
      })
    ).json();

    await fetch(videoTicket.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: dummyMp4,
    });

    const compVideo = await (
      await fetch(`${baseUrl}/media/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teenToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageKey: videoTicket.data.storageKey,
          mediaType: 'VIDEO',
          fileSizeBytes: dummyMp4.length,
          durationSeconds: 25,
        }),
      })
    ).json();
    const videoAssetId = compVideo.data.mediaAssetId;

    // Step 2 & 3: Teen creates Reel requesting JUNIOR, EXPLORER and TEEN
    const reelRes = await (
      await fetch(`${baseUrl}/reels`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teenToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '360 Kickflip on Concrete Ramp',
          caption: 'Complex street skating trick tutorial.',
          videoAssetId,
          durationSeconds: 25,
          type: 'REEL',
          requestedAudiences: ['JUNIOR', 'EXPLORER', 'TEEN'],
        }),
      })
    ).json();
    expect(reelRes.success).toBe(true);
    expect(reelRes.data.status).toBe('PENDING_REVIEW');
    const reelId = reelRes.data.id;

    // Step 4 & 5: Admin reviews and approves TEEN ONLY
    const adminDecision = await (
      await fetch(`${baseUrl}/moderation/decision/${reelId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'APPROVE',
          reason: 'High intensity sports clip; suitable for teens only.',
          internalNotes: 'Avoid showing to younger kids without safety gear.',
          approvedAudiences: ['TEEN'],
        }),
      })
    ).json();
    expect(adminDecision.success).toBe(true);
    expect(adminDecision.data.newStatus).toBe('APPROVED');

    // Step 6: TEEN users can see the Reel
    const teenFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenFeed.data.some((r: any) => r.id === reelId)).toBe(true);

    // Step 7: JUNIOR users cannot see the Reel
    const juniorFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(juniorFeed.data.some((r: any) => r.id === reelId)).toBe(false);

    // Step 8: EXPLORER users cannot see the Reel
    const explorerFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${explorerToken}` },
      })
    ).json();
    expect(explorerFeed.data.some((r: any) => r.id === reelId)).toBe(false);

    // Step 9: Direct API requests from unauthorized users are rejected
    const juniorDirect = await (
      await fetch(`${baseUrl}/contents/${reelId}`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(juniorDirect.success).toBe(false);
    expect(juniorDirect.error.code).toBe('CONTENT_UNAVAILABLE');

    const explorerDirect = await (
      await fetch(`${baseUrl}/contents/${reelId}`, {
        headers: { Authorization: `Bearer ${explorerToken}` },
      })
    ).json();
    expect(explorerDirect.success).toBe(false);
    expect(explorerDirect.error.code).toBe('CONTENT_UNAVAILABLE');
  });

  // =========================================================================
  // SCENARIO C — Parent safety controls
  // 1. Parent logs in.
  // 2. Parent views linked children.
  // 3. Parent changes a safety setting.
  // 4. Backend enforces the setting.
  // 5. Parent can see the updated setting.
  // =========================================================================
  it('Scenario C: Parent viewing linked kids, modifying guardrails & backend enforcement', async () => {
    // Step 2: Parent views linked children
    const kidsRes = await (
      await fetch(`${baseUrl}/parent/children`, {
        headers: { Authorization: `Bearer ${parentToken}` },
      })
    ).json();
    expect(kidsRes.success).toBe(true);
    expect(kidsRes.data.length).toBeGreaterThan(0);
    const linkedChild = kidsRes.data.find((k: any) => k.child.username === juniorUsername);
    expect(linkedChild).toBeDefined();

    // Step 3: Parent changes a safety setting (disable comments + screen limit to 40 mins)
    const updateRes = await (
      await fetch(`${baseUrl}/parent/children/${juniorUsername}/settings`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${parentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canComment: false,
          dailyLimitMinutes: 40,
        }),
      })
    ).json();
    expect(updateRes.success).toBe(true);
    expect(updateRes.data.settings.canComment).toBe(false);
    expect(updateRes.data.settings.dailyLimitMinutes).toBe(40);

    // Step 4: Backend enforces the setting (Junior attempts to comment on an approved post)
    const post = await prisma.content.findFirst({ where: { status: 'APPROVED' } });
    const blockedComment = await (
      await fetch(`${baseUrl}/comments/${post!.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${juniorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Attempting to comment while disabled.' }),
      })
    ).json();
    expect(blockedComment.success).toBe(false);
    expect(blockedComment.error.code).toBe('COMMENTS_DISABLED_BY_PARENT');

    // Step 5: Parent can see the updated setting in settings query
    const verifySettings = await (
      await fetch(`${baseUrl}/parent/children/${juniorUsername}/settings`, {
        headers: { Authorization: `Bearer ${parentToken}` },
      })
    ).json();
    expect(verifySettings.success).toBe(true);
    expect(verifySettings.data.settings.canComment).toBe(false);
    expect(verifySettings.data.settings.dailyLimitMinutes).toBe(40);
  });

  // =========================================================================
  // SCENARIO D — Comments and reports
  // 1. Child submits a comment.
  // 2. Comment remains hidden until approved.
  // 3. Admin approves the comment.
  // 4. Eligible users can see it.
  // 5. Child reports content.
  // 6. Admin sees and resolves the report.
  // =========================================================================
  it('Scenario D: Zero-trust comment moderation, child content reporting & resolution', async () => {
    // 1. Re-enable comments for Maya (Explorer)
    const approvedPost = await prisma.content.findFirst({
      where: { status: 'APPROVED', type: 'POST' },
    });

    // Step 1: Maya submits a comment
    const commentRes = await (
      await fetch(`${baseUrl}/comments/${approvedPost!.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${explorerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Awesome art! Loved the color palette! 🎨' }),
      })
    ).json();
    expect(commentRes.success).toBe(true);
    expect(commentRes.data.status).toBe('PENDING_REVIEW');
    const commentId = commentRes.data.id;

    // Step 2: Comment remains hidden from other kids (Teen)
    const teenCommentsBefore = await (
      await fetch(`${baseUrl}/comments/${approvedPost!.id}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenCommentsBefore.data.some((c: any) => c.id === commentId)).toBe(false);

    // Step 3: Admin approves the comment
    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'APPROVED' },
    });

    // Step 4: Eligible users (Teen & Junior) can now see it
    const teenCommentsAfter = await (
      await fetch(`${baseUrl}/comments/${approvedPost!.id}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenCommentsAfter.data.some((c: any) => c.id === commentId)).toBe(true);

    // Step 5: Child reports content
    const reportRes = await (
      await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${juniorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: approvedPost!.id,
          reason: 'Accidental private sign shown',
          details: 'Sign in corner might have street name.',
        }),
      })
    ).json();
    expect(reportRes.success).toBe(true);
    const reportId = reportRes.data.reportId;

    // Step 6: Admin sees and resolves the report
    const queue = await (
      await fetch(`${baseUrl}/reports?status=PENDING`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    expect(queue.data.some((r: any) => r.id === reportId)).toBe(true);

    const resolveRes = await (
      await fetch(`${baseUrl}/reports/${reportId}/resolve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RESOLVED',
          actionTaken: 'Inspected frame; verified sign is a cartoon drawing, not real address.',
        }),
      })
    ).json();
    expect(resolveRes.success).toBe(true);
    expect(resolveRes.data.status).toBe('RESOLVED');
  });
});
