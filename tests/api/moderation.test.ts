import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Central Content Creation & Zero-Trust Moderation Engine Suite', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4040;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  let childToken: string;
  let childId: string;
  let adminToken: string;
  let adminId: string;
  let sampleImageMediaAssetId: string;
  let sampleVideoMediaAssetId: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // 1. Authenticate child (Maya Explorer)
    const childLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
    });
    const childData = (await childLogin.json()).data;
    childToken = childData.session.token;
    childId = childData.user.id;

    // 2. Authenticate Admin (Captain Moderator)
    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
    });
    const adminData = (await adminLogin.json()).data;
    adminToken = adminData.session.token;
    adminId = adminData.user.id;

    // 3. Upload a sample image via media pipeline for child
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const imgTicket = await (
      await fetch(`${baseUrl}/media/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
        body: JSON.stringify({
          fileName: 'test_photo.png',
          mimeType: 'image/png',
          fileSizeBytes: samplePng.length,
          mediaType: 'IMAGE',
        }),
      })
    ).json();
    await fetch(imgTicket.data.uploadUrl, { method: 'PUT', body: samplePng });
    const imgComplete = await (
      await fetch(`${baseUrl}/media/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
        body: JSON.stringify({
          storageKey: imgTicket.data.storageKey,
          mediaType: 'IMAGE',
          fileSizeBytes: samplePng.length,
        }),
      })
    ).json();
    sampleImageMediaAssetId = imgComplete.data.mediaAssetId;

    // 4. Create sample video asset for child
    const videoTicket = await (
      await fetch(`${baseUrl}/media/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
        body: JSON.stringify({
          fileName: 'test_video.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 1024,
          mediaType: 'VIDEO',
        }),
      })
    ).json();
    // Simulate raw video bytes (MP4 ftyp box signature)
    const dummyMp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    await fetch(videoTicket.data.uploadUrl, { method: 'PUT', body: dummyMp4 });
    const videoComplete = await (
      await fetch(`${baseUrl}/media/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
        body: JSON.stringify({
          storageKey: videoTicket.data.storageKey,
          mediaType: 'VIDEO',
          fileSizeBytes: dummyMp4.length,
          durationSeconds: 15,
        }),
      })
    ).json();
    sampleVideoMediaAssetId = videoComplete.data.mediaAssetId;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Child creates photo post: Saved as PENDING_REVIEW with NO audience selected', async () => {
    const res = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
      body: JSON.stringify({
        caption: 'Look at my new telescope! 🔭',
        mediaAssetId: sampleImageMediaAssetId,
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PENDING_REVIEW');
    expect(body.data.type).toBe('POST');

    // Verify in database that NO approved audiences exist yet
    const dbPost = await prisma.content.findUnique({
      where: { id: body.data.id },
      include: { approvedAudiences: true, requestedAudiences: true },
    });
    expect(dbPost?.status).toBe('PENDING_REVIEW');
    expect(dbPost?.approvedAudiences.length).toBe(0);
    expect(dbPost?.requestedAudiences.length).toBe(0);
  });

  it('Child creates Reel: Requires requestedAudiences, stores them separately, remains PENDING_REVIEW', async () => {
    // 1. Missing requested audience should be rejected by validation
    const invalidRes = await fetch(`${baseUrl}/reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
      body: JSON.stringify({
        title: 'Science Experiment',
        videoAssetId: sampleVideoMediaAssetId,
        durationSeconds: 20,
        requestedAudiences: [], // Empty rejected
      }),
    });
    expect(invalidRes.status).toBe(400);

    // 2. Valid creation with requested audiences
    const validRes = await fetch(`${baseUrl}/reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
      body: JSON.stringify({
        title: 'Baking Soda Volcano Eruption!',
        caption: 'Watch the fizz! 🌋',
        videoAssetId: sampleVideoMediaAssetId,
        durationSeconds: 18,
        type: 'REEL',
        requestedAudiences: ['JUNIOR', 'EXPLORER'],
      }),
    });

    const body = await validRes.json();
    expect(validRes.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PENDING_REVIEW');

    // Database verification: Requested audiences exist, approved audiences do NOT
    const dbReel = await prisma.content.findUnique({
      where: { id: body.data.id },
      include: { requestedAudiences: true, approvedAudiences: true },
    });
    expect(dbReel?.requestedAudiences.map((r) => r.ageGroup).sort()).toEqual(['EXPLORER', 'JUNIOR']);
    expect(dbReel?.approvedAudiences.length).toBe(0);
  });

  it('Admin claims and reviews post: Approving makes it eligible for ALL three age tiers', async () => {
    // 1. Create a post to review
    const postRes = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
      body: JSON.stringify({
        caption: 'Watercolor sunset painting 🌅',
        mediaAssetId: sampleImageMediaAssetId,
      }),
    });
    const postId = (await postRes.json()).data.id;

    // 2. Admin claims post
    const claimRes = await fetch(`${baseUrl}/moderation/claim/${postId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(claimRes.status).toBe(200);

    // 3. Admin approves post
    const decisionRes = await fetch(`${baseUrl}/moderation/decision/${postId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        decision: 'APPROVE',
        reason: 'Beautiful art painting. Safe for all kids.',
        internalNotes: 'Admin approved without restrictions.',
      }),
    });

    const decisionBody = await decisionRes.json();
    expect(decisionRes.status).toBe(200);
    expect(decisionBody.data.newStatus).toBe('APPROVED');

    // Verify DB: Posts receive all 3 age groups upon approval!
    const updatedPost = await prisma.content.findUnique({
      where: { id: postId },
      include: { approvedAudiences: true, moderationActions: true, reviews: true },
    });
    expect(updatedPost?.status).toBe('APPROVED');
    expect(updatedPost?.approvedAudiences.map((a) => a.ageGroup).sort()).toEqual([
      'EXPLORER',
      'JUNIOR',
      'TEEN',
    ]);
    expect(updatedPost?.moderationActions.length).toBeGreaterThan(0);
    expect(updatedPost?.reviews[0]?.internalNotes).toBe('Admin approved without restrictions.');
  });

  it('Admin reviews Reel: Selects approved audience from requested audiences, prevents unrequested tiers', async () => {
    // 1. Create reel where creator requested JUNIOR + EXPLORER
    const reelRes = await fetch(`${baseUrl}/reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
      body: JSON.stringify({
        title: 'Building a Lego Tower',
        videoAssetId: sampleVideoMediaAssetId,
        durationSeconds: 15,
        type: 'REEL',
        requestedAudiences: ['JUNIOR', 'EXPLORER'],
      }),
    });
    const reelId = (await reelRes.json()).data.id;

    // 2. Admin attempts to approve TEEN (which was NOT requested by creator) -> Expect rejection
    const unrequestedAttempt = await fetch(`${baseUrl}/moderation/decision/${reelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        decision: 'APPROVE',
        approvedAudiences: ['TEEN'], // Violation!
      }),
    });
    const unrequestedBody = await unrequestedAttempt.json();
    expect(unrequestedAttempt.status).toBe(400);
    expect(unrequestedBody.error.message).toContain('Safety violation');

    // 3. Admin approves valid requested subset (EXPLORER only)
    const validApproval = await fetch(`${baseUrl}/moderation/decision/${reelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        decision: 'APPROVE',
        approvedAudiences: ['EXPLORER'],
        reason: 'Approved for explorer tier.',
      }),
    });
    expect(validApproval.status).toBe(200);

    // Verify DB: Requested audiences preserved, approved audiences assigned
    const dbReel = await prisma.content.findUnique({
      where: { id: reelId },
      include: { requestedAudiences: true, approvedAudiences: true },
    });
    expect(dbReel?.requestedAudiences.map((r) => r.ageGroup).sort()).toEqual(['EXPLORER', 'JUNIOR']);
    expect(dbReel?.approvedAudiences.map((a) => a.ageGroup)).toEqual(['EXPLORER']);
  });

  it('Prevents self-approval: Creator cannot approve their own content even if admin', async () => {
    // Admin creates a content item
    const adminPost = await prisma.content.create({
      data: {
        authorId: adminId,
        type: 'POST',
        status: 'PENDING_REVIEW',
        caption: 'Admin personal test post',
      },
    });

    // Admin attempts to approve their own post -> Rejected
    const selfApproveRes = await fetch(`${baseUrl}/moderation/decision/${adminPost.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        decision: 'APPROVE',
      }),
    });

    const selfBody = await selfApproveRes.json();
    expect(selfApproveRes.status).toBe(400);
    expect(selfBody.error.message).toContain('Administrators cannot moderate their own content');
  });

  it('Child cannot call moderation decision endpoints (RBAC protected)', async () => {
    const res = await fetch(`${baseUrl}/moderation/decision/some-content-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });

    expect(res.status).toBe(403);
  });

  it('Profile bio update stays pending without overwriting current approved bio', async () => {
    // Current user bio
    const originalUser = await prisma.user.findUnique({ where: { id: childId } });

    // Submit new bio
    const res = await fetch(`${baseUrl}/users/bio`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${childToken}` },
      body: JSON.stringify({ bio: 'Brand new pending astronaut bio! 🚀' }),
    });

    expect(res.status).toBe(200);

    // DB check: bio is still original, pendingBio is set
    const userInDb = await prisma.user.findUnique({ where: { id: childId } });
    expect(userInDb?.bio).toBe(originalUser?.bio);
    expect(userInDb?.pendingBio).toBe('Brand new pending astronaut bio! 🚀');

    // Enqueued in moderation Content table
    const modContent = await prisma.content.findFirst({
      where: { authorId: childId, type: 'PROFILE_BIO', status: 'PENDING_REVIEW' },
    });
    expect(modContent).toBeDefined();

    // Admin approves the bio change
    const approveRes = await fetch(`${baseUrl}/moderation/decision/${modContent!.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ decision: 'APPROVE', reason: 'Safe friendly bio.' }),
    });
    expect(approveRes.status).toBe(200);

    // DB check: bio is now officially updated, pendingBio cleared
    const updatedUser = await prisma.user.findUnique({ where: { id: childId } });
    expect(updatedUser?.bio).toBe('Brand new pending astronaut bio! 🚀');
    expect(updatedUser?.pendingBio).toBeNull();
  });
});
