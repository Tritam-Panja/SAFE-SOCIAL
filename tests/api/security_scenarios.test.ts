import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Prompt 14: Comprehensive Security & Scenario Verification Suite', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4099;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  let childToken: string;
  let childId: string;
  let childUsername: string;
  let juniorToken: string;
  let juniorId: string;
  let teenToken: string;
  let teenId: string;
  let teenUsername: string;
  let parentToken: string;
  let parentId: string;
  let adminToken: string;
  let adminId: string;

  let submittedPhotoPostId: string;
  let submittedReelId: string;
  let pendingCommentId: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // Ensure clean state for parent controls
    await prisma.parentControl.updateMany({
      data: {
        isPaused: false,
        canAddFriends: true,
        canReceiveFriendRequests: true,
        canComment: true,
        canWatchShortsReels: true,
      },
    });
  });

  afterAll(async () => {
    // Restore parent controls
    await prisma.parentControl.updateMany({
      data: {
        isPaused: false,
        canAddFriends: true,
        canReceiveFriendRequests: true,
        canComment: true,
        canWatchShortsReels: true,
      },
    });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // =========================================================================
  // SCENARIO 1: Child can register and log in
  // =========================================================================
  it('Scenario 1: Child can register and log in', async () => {
    const timestamp = Date.now();
    childUsername = `kid_sec_${timestamp}`;

    // Register child (Junior age: 7 years old)
    const regRes = await (
      await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: childUsername,
          displayName: 'Security Test Kid',
          password: 'Password123!',
          birthDate: '2019-05-15',
          role: 'CHILD',
        }),
      })
    ).json();

    expect(regRes.success).toBe(true);
    expect(regRes.data.user.role).toBe('CHILD');
    expect(regRes.data.user.ageGroup).toBe('JUNIOR');
    expect(regRes.data.session.token).toBeDefined();

    childToken = regRes.data.session.token;
    childId = regRes.data.user.id;

    // Login as child
    const loginRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: childUsername,
          password: 'Password123!',
        }),
      })
    ).json();

    expect(loginRes.success).toBe(true);
    expect(loginRes.data.user.id).toBe(childId);
  });

  // =========================================================================
  // SCENARIO 2: Parent can register and log in
  // =========================================================================
  it('Scenario 2: Parent can register and log in', async () => {
    const timestamp = Date.now();
    const username = `parent_sec_${timestamp}`;
    const email = `parent_sec_${timestamp}@fizzykids.safe`;

    // Register parent
    const regRes = await (
      await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          displayName: 'Security Guardian',
          password: 'Password123!',
          birthDate: '1985-02-10',
          role: 'PARENT',
        }),
      })
    ).json();

    expect(regRes.success).toBe(true);
    expect(regRes.data.user.role).toBe('PARENT');
    expect(regRes.data.session.token).toBeDefined();

    parentToken = regRes.data.session.token;
    parentId = regRes.data.user.id;

    // Login as parent
    const loginRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: username,
          password: 'Password123!',
        }),
      })
    ).json();

    expect(loginRes.success).toBe(true);
    expect(loginRes.data.user.role).toBe('PARENT');
  });

  // =========================================================================
  // SCENARIO 3: Admin can log in through the configured bootstrap process
  // =========================================================================
  it('Scenario 3: Admin can log in through the configured bootstrap process', async () => {
    const loginRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: 'safety_admin',
          password: 'Password123!',
        }),
      })
    ).json();

    expect(loginRes.success).toBe(true);
    expect(loginRes.data.user.role).toBe('ADMIN');

    adminToken = loginRes.data.session.token;
    adminId = loginRes.data.user.id;

    // Obtain Leo Junior login token
    const juniorRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: 'leo_lion_7',
          password: 'Password123!',
        }),
      })
    ).json();
    juniorToken = juniorRes.data.session.token;
    juniorId = juniorRes.data.user.id;

    // Also obtain Teen login token for age group feed comparisons
    const teenRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: 'jordan_teen_skater',
          password: 'Password123!',
        }),
      })
    ).json();
    teenToken = teenRes.data.session.token;
    teenId = teenRes.data.user.id;
    teenUsername = 'jordan_teen_skater';
  });

  // =========================================================================
  // SCENARIO 4: Child cannot access admin endpoints (RBAC)
  // =========================================================================
  it('Scenario 4: Child cannot access admin endpoints (RBAC)', async () => {
    // Attempt admin dashboard
    const dashRes = await (
      await fetch(`${baseUrl}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(dashRes.success).toBe(false);
    expect(dashRes.error.code).toBe('FORBIDDEN');

    // Attempt admin audit logs
    const auditRes = await (
      await fetch(`${baseUrl}/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(auditRes.error.code).toBe('FORBIDDEN');

    // Attempt admin user management
    const usersRes = await (
      await fetch(`${baseUrl}/admin/users`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(usersRes.error.code).toBe('FORBIDDEN');
  });

  // =========================================================================
  // SCENARIO 5: Child can submit a photo post
  // =========================================================================
  it('Scenario 5: Child can submit a photo post', async () => {
    // 1. Child uploads media to quarantine
    const uploadRes = await (
      await fetch(`${baseUrl}/media/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'drawing.png',
          mimeType: 'image/png',
          fileSizeBytes: 2048,
          mediaType: 'IMAGE',
        }),
      })
    ).json();

    expect(uploadRes.success).toBe(true);
    const { uploadUrl, storageKey } = uploadRes.data;

    // Simulate upload to local-upload adapter
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: pngBytes,
    });

    // Complete media upload
    const compRes = await (
      await fetch(`${baseUrl}/media/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storageKey,
          mediaType: 'IMAGE',
          fileSizeBytes: pngBytes.length,
        }),
      })
    ).json();

    expect(compRes.success).toBe(true);
    const { mediaAssetId } = compRes.data;

    // 2. Submit post for moderation via POST /posts
    const submitRes = await (
      await fetch(`${baseUrl}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caption: 'Look what I painted today!',
          mediaAssetId,
        }),
      })
    ).json();

    expect(submitRes.success).toBe(true);
    expect(submitRes.data.status).toBe('PENDING_REVIEW');
    submittedPhotoPostId = submitRes.data.id;
  });

  // =========================================================================
  // SCENARIO 6: Pending posts are invisible to other children
  // =========================================================================
  it('Scenario 6: Pending posts are invisible to other children', async () => {
    // Teen tries to fetch home feed
    const feedRes = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();

    expect(feedRes.success).toBe(true);
    const items = feedRes.data;
    const foundInFeed = items.some((item: any) => item.id === submittedPhotoPostId);
    expect(foundInFeed).toBe(false);

    // Teen tries direct GET of pending post
    const directRes = await (
      await fetch(`${baseUrl}/contents/${submittedPhotoPostId}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();

    expect(directRes.success).toBe(false);
  });

  // =========================================================================
  // SCENARIO 7: Child can submit a Reel with requested audiences
  // =========================================================================
  it('Scenario 7: Child can submit a Reel with requested audiences', async () => {
    // 1. Upload video
    const uploadRes = await (
      await fetch(`${baseUrl}/media/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'skate_trick.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1048576,
          mediaType: 'VIDEO',
        }),
      })
    ).json();

    expect(uploadRes.success).toBe(true);
    const { uploadUrl, storageKey } = uploadRes.data;

    // Synthetic MP4 ftyp box bytes
    const mp4Bytes = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
      0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
      0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
    ]);

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: mp4Bytes,
    });

    const compRes = await (
      await fetch(`${baseUrl}/media/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storageKey,
          mediaType: 'VIDEO',
          fileSizeBytes: mp4Bytes.length,
          durationSeconds: 20,
        }),
      })
    ).json();

    expect(compRes.success).toBe(true);
    const { mediaAssetId } = compRes.data;

    // Submit Reel requesting EXPLORER and TEEN audiences via POST /reels
    const reelRes = await (
      await fetch(`${baseUrl}/reels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'High Jump Practice',
          caption: 'Only for older kids!',
          videoAssetId: mediaAssetId,
          durationSeconds: 20,
          type: 'REEL',
          requestedAudiences: ['EXPLORER', 'TEEN'],
        }),
      })
    ).json();

    expect(reelRes.success).toBe(true);
    expect(reelRes.data.type).toBe('REEL');
    expect(reelRes.data.status).toBe('PENDING_REVIEW');
    submittedReelId = reelRes.data.id;
  });

  // =========================================================================
  // SCENARIO 8: Admin can approve the Reel for a subset of requested audiences
  // =========================================================================
  it('Scenario 8: Admin can approve the Reel for a subset of requested audiences', async () => {
    // Admin attempts to approve with an unauthorized audience (JUNIOR was not requested)
    const invalidAudienceRes = await (
      await fetch(`${baseUrl}/moderation/decision/${submittedReelId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'APPROVE',
          reason: 'Safe for teens',
          approvedAudiences: ['JUNIOR', 'TEEN'], // Invariant violation!
        }),
      })
    ).json();

    expect(invalidAudienceRes.success).toBe(false);
    expect(invalidAudienceRes.error.message).toContain('Safety violation');

    // Admin approves for a valid subset: TEEN only
    const validApprovalRes = await (
      await fetch(`${baseUrl}/moderation/decision/${submittedReelId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'APPROVE',
          reason: 'Safe and appropriate for teens only.',
          internalNotes: 'Verified audio and visual contents conform to teen standards.',
          approvedAudiences: ['TEEN'],
        }),
      })
    ).json();

    expect(validApprovalRes.success).toBe(true);
    expect(validApprovalRes.data.newStatus).toBe('APPROVED');
  });

  // =========================================================================
  // SCENARIO 9: Approved content appears to authorized age groups only
  // =========================================================================
  it('Scenario 9: Approved content appears to authorized age groups only', async () => {
    // 1. Teen (TEEN ageGroup) queries reels feed -> MUST find it
    const teenReelsRes = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();

    expect(teenReelsRes.success).toBe(true);
    const teenHasReel = teenReelsRes.data.some((r: any) => r.id === submittedReelId);
    expect(teenHasReel).toBe(true);

    // 2. Child (JUNIOR ageGroup) queries reels feed -> MUST NOT find it
    const juniorReelsRes = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(juniorReelsRes.success).toBe(true);
    const juniorHasReel = juniorReelsRes.data.some((r: any) => r.id === submittedReelId);
    expect(juniorHasReel).toBe(false);
  });

  // =========================================================================
  // SCENARIO 10: Unauthorized age groups cannot retrieve content through direct API requests
  // =========================================================================
  it('Scenario 10: Unauthorized age groups cannot retrieve content through direct API requests', async () => {
    // Junior child (non-owner) attempts direct GET /api/v1/contents/:id on the TEEN-approved Reel
    const directJuniorRes = await (
      await fetch(`${baseUrl}/contents/${submittedReelId}`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();

    expect(directJuniorRes.success).toBe(false);
    expect(directJuniorRes.error.code).toBe('CONTENT_UNAVAILABLE');

    // Teen child direct GET -> MUST succeed (200)
    const directTeenRes = await (
      await fetch(`${baseUrl}/contents/${submittedReelId}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();

    expect(directTeenRes.success).toBe(true);
    expect(directTeenRes.data.id).toBe(submittedReelId);
  });

  // =========================================================================
  // SCENARIO 11: Rejected content remains unavailable
  // =========================================================================
  it('Scenario 11: Rejected content remains unavailable', async () => {
    // Admin rejects the photo post submitted earlier
    const rejectRes = await (
      await fetch(`${baseUrl}/moderation/decision/${submittedPhotoPostId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'REJECT',
          reason: 'Image contains personal contact info.',
          internalNotes: 'Disclosed phone number in background drawing.',
        }),
      })
    ).json();

    expect(rejectRes.success).toBe(true);
    expect(rejectRes.data.newStatus).toBe('REJECTED');

    // Both Teen and Junior (non-owners) attempt to retrieve rejected post directly -> 404
    const teenGet = await (
      await fetch(`${baseUrl}/contents/${submittedPhotoPostId}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenGet.success).toBe(false);

    const otherJuniorGet = await (
      await fetch(`${baseUrl}/contents/${submittedPhotoPostId}`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(otherJuniorGet.success).toBe(false);
  });

  // =========================================================================
  // SCENARIO 12: Comments require moderation
  // =========================================================================
  it('Scenario 12: Comments require moderation', async () => {
    // Retrieve an approved post for comments testing
    const approvedPost = await prisma.content.findFirst({
      where: { status: 'APPROVED', type: 'POST' },
    });

    // Ensure it has approvedAudiences for all tiers
    await prisma.contentApprovedAudience.deleteMany({ where: { contentId: approvedPost!.id } });
    await prisma.contentApprovedAudience.createMany({
      data: [
        { contentId: approvedPost!.id, ageGroup: 'JUNIOR' },
        { contentId: approvedPost!.id, ageGroup: 'EXPLORER' },
        { contentId: approvedPost!.id, ageGroup: 'TEEN' },
      ],
    });

    // Junior (Leo) submits comment via POST /comments/:contentId
    const commentRes = await (
      await fetch(`${baseUrl}/comments/${approvedPost!.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${juniorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: 'This is my super nice comment on your post!',
        }),
      })
    ).json();

    if (!commentRes.success) {
      console.error('Comment submission error:', commentRes);
    }

    expect(commentRes.success).toBe(true);
    expect(commentRes.data.status).toBe('PENDING_REVIEW');
    pendingCommentId = commentRes.data.id;

    // Teen views comments on post -> pending comment MUST NOT be visible
    const getCommentsRes = await (
      await fetch(`${baseUrl}/comments/${approvedPost!.id}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();

    expect(getCommentsRes.success).toBe(true);
    const visibleComment = getCommentsRes.data.some((c: any) => c.id === pendingCommentId);
    expect(visibleComment).toBe(false);

    // Admin approves comment in database
    await prisma.comment.update({
      where: { id: pendingCommentId },
      data: { status: 'APPROVED' },
    });

    // Teen views comments again -> now it is visible!
    const getApprovedCommentsRes = await (
      await fetch(`${baseUrl}/comments/${approvedPost!.id}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();

    expect(getApprovedCommentsRes.success).toBe(true);
    const nowVisible = getApprovedCommentsRes.data.some((c: any) => c.id === pendingCommentId);
    expect(nowVisible).toBe(true);
  });

  // =========================================================================
  // SCENARIO 13: Parent controls actually restrict the relevant operations
  // =========================================================================
  it('Scenario 13: Parent controls actually restrict the relevant operations', async () => {
    // 1. Link child to parent
    const childProfile = await prisma.childProfile.findUnique({ where: { userId: childId } });

    const linkRes = await (
      await fetch(`${baseUrl}/parent/link-requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${parentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          childUsername,
          verificationCode: childProfile!.parentLinkCode,
        }),
      })
    ).json();

    expect(linkRes.success).toBe(true);

    // 2. Parent pauses child account
    const pauseRes = await (
      await fetch(`${baseUrl}/parent/children/${childUsername}/settings`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${parentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isPaused: true,
          pauseReason: 'Time for homework.',
        }),
      })
    ).json();

    expect(pauseRes.success).toBe(true);
    expect(pauseRes.data.settings.isPaused).toBe(true);

    // 3. Child attempts to post comment while account is paused -> 403 ACCOUNT_PAUSED_BY_PARENT
    const post = await prisma.content.findFirst({ where: { status: 'APPROVED' } });
    const pausedActionRes = await (
      await fetch(`${baseUrl}/comments/${post!.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Trying to comment while paused.' }),
      })
    ).json();

    expect(pausedActionRes.success).toBe(false);
    expect(pausedActionRes.error.code).toBe('ACCOUNT_PAUSED_BY_PARENT');

    // 4. Parent unpauses but disables friend requests
    await fetch(`${baseUrl}/parent/children/${childUsername}/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${parentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isPaused: false,
        canAddFriends: false,
      }),
    });

    // 5. Child tries to send friend request -> 403 FRIENDS_DISABLED_BY_PARENT
    const friendReqRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${childToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUsername: teenUsername,
        }),
      })
    ).json();

    expect(friendReqRes.success).toBe(false);
    expect(friendReqRes.error.code).toBe('FRIENDS_DISABLED_BY_PARENT');
  });

  // =========================================================================
  // SCENARIO 14: Users cannot access another user's private resources (IDOR)
  // =========================================================================
  it("Scenario 14: Users cannot access another user's private resources (IDOR prevention)", async () => {
    // Child creates private draft content
    const privateDraft = await prisma.content.create({
      data: {
        authorId: childId,
        type: 'POST',
        title: 'Child Private Diary',
        status: 'DRAFT',
      },
    });

    // Teen attempts direct object reference to read private draft
    const teenAttempt = await (
      await fetch(`${baseUrl}/contents/${privateDraft.id}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();

    expect(teenAttempt.success).toBe(false);

    // Parent attempts to access settings of an unlinked child (Teenager Jordan)
    const unlinkedAttempt = await (
      await fetch(`${baseUrl}/parent/children/${teenId}/settings`, {
        headers: { Authorization: `Bearer ${parentToken}` },
      })
    ).json();

    expect(unlinkedAttempt.success).toBe(false);
    expect(unlinkedAttempt.error.code).toBe('FORBIDDEN_GUARDIAN_LINK');
  });

  // =========================================================================
  // SCENARIO 15: Reports appear in the admin dashboard
  // =========================================================================
  it('Scenario 15: Reports appear in the admin dashboard', async () => {
    // Approved post to report
    const targetPost = await prisma.content.findFirst({
      where: { status: 'APPROVED' },
    });

    // Teen files report
    const reportRes = await (
      await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentId: targetPost!.id,
          reason: 'Suspicious comment in video',
          details: 'Timestamp 0:12 shows personal information',
        }),
      })
    ).json();

    expect(reportRes.success).toBe(true);
    const reportId = reportRes.data.reportId;

    // Admin retrieves dashboard metrics -> reportedContent count > 0
    const dashRes = await (
      await fetch(`${baseUrl}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();

    expect(dashRes.success).toBe(true);
    expect(dashRes.data.metrics.reportedContent).toBeGreaterThan(0);

    // Admin retrieves reports queue
    const queueRes = await (
      await fetch(`${baseUrl}/reports?status=PENDING`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();

    expect(queueRes.success).toBe(true);
    const foundReport = queueRes.data.some((r: any) => r.id === reportId);
    expect(foundReport).toBe(true);

    // Admin resolves report
    const resolveRes = await (
      await fetch(`${baseUrl}/reports/${reportId}/resolve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'RESOLVED',
          actionTaken: 'Inspected frame and determined it was a drawing, no real PII.',
        }),
      })
    ).json();

    expect(resolveRes.success).toBe(true);
    expect(resolveRes.data.status).toBe('RESOLVED');
  });
});
