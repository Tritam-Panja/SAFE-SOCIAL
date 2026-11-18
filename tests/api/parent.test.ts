import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Parent Accounts, Child Linking & Strict Ownership Isolation Suite', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4070;
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  let parentSarahToken: string;
  let parentSarahId: string;
  let parentSecondToken: string;
  let parentSecondId: string;
  let leoToken: string;
  let leoUsername: string;
  let leoProfileCode: string;
  let mayaUsername: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // 1. Login Primary Parent (Sarah)
    const sarahRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'guardian_sarah', password: 'Password123!' }),
      })
    ).json();
    parentSarahToken = sarahRes.data.session.token;
    parentSarahId = sarahRes.data.user.id;

    // 2. Register/Login a Second Parent to test multi-parent isolation
    const secondReg = await (
      await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `parent_alex_${Date.now()}`,
          displayName: 'Parent Alex',
          email: `alex_${Date.now()}@example.com`,
          password: 'Password123!',
          role: 'PARENT',
        }),
      })
    ).json();
    parentSecondToken = secondReg.data.session.token;
    parentSecondId = secondReg.data.user.id;

    // 3. Child accounts info
    const leoUser = await prisma.user.findUnique({
      where: { username: 'leo_lion_7' },
      include: { childProfile: true },
    });
    leoUsername = leoUser!.username;
    leoProfileCode = leoUser!.childProfile!.parentLinkCode;

    const mayaUser = await prisma.user.findUnique({
      where: { username: 'maya_explorer' },
      include: { childProfile: true },
    });
    mayaUsername = mayaUser!.username;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('Parent cannot link a child using just username without valid verification code', async () => {
    const res = await (
      await fetch(`${baseUrl}/parent/link-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${parentSecondToken}`,
        },
        body: JSON.stringify({
          childUsername: leoUsername,
          verificationCode: 'WRONG-CODE-999',
        }),
      })
    ).json();

    expect(res.success).toBe(false);
    expect(res.error.code).toBe('INVALID_VERIFICATION_CODE');
  });

  it('Child account cannot call parent linking endpoints (RBAC check)', async () => {
    // Login Leo (Child)
    const leoLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    leoToken = leoLogin.data.session.token;

    const res = await (
      await fetch(`${baseUrl}/parent/children`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();

    expect(res.success).toBe(false);
    expect(res.error.code).toBe('FORBIDDEN');
  });

  it('Parent successfully links child using valid verification code', async () => {
    // Unlink first if already linked to test clean workflow
    const alexProfile = await prisma.parentProfile.findUnique({ where: { userId: parentSecondId } });
    const leoChild = await prisma.childProfile.findFirst({ where: { user: { username: leoUsername } } });
    await prisma.parentChildLink.deleteMany({
      where: { parentId: alexProfile!.id, childId: leoChild!.id },
    });

    const res = await (
      await fetch(`${baseUrl}/parent/link-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${parentSecondToken}`,
        },
        body: JSON.stringify({
          childUsername: leoUsername,
          verificationCode: leoProfileCode,
        }),
      })
    ).json();

    expect(res.success).toBe(true);
    expect(res.data.status).toBe('CONFIRMED');
    expect(res.data.child.username).toBe(leoUsername);
  });

  it('Parent dashboard data retrieves linked children with masked non-PII and safety controls', async () => {
    const res = await (
      await fetch(`${baseUrl}/parent/children`, {
        headers: { Authorization: `Bearer ${parentSecondToken}` },
      })
    ).json();

    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
    const childEntry = res.data.find((c: any) => c.child.username === leoUsername);
    expect(childEntry).toBeDefined();

    // Verify child safety settings and no PII leak
    expect(childEntry.child.displayName).toBeDefined();
    expect(childEntry.child.ageGroup).toBe('JUNIOR');
    expect(childEntry.safetySettings).toBeDefined();
    expect(childEntry.safetySettings.dailyLimitMinutes).toBeGreaterThan(0);

    // Verify NO passwordHash or session tokens or birthdates in payload
    expect(childEntry.child.passwordHash).toBeUndefined();
    expect(childEntry.child.sessionToken).toBeUndefined();
    expect(childEntry.child.birthDate).toBeUndefined();
  });

  it('Strict ownership isolation: One parent CANNOT view or unlink another parent’s child relationship', async () => {
    // Sarah views her children (Leo is already seeded for Sarah)
    const sarahChildrenRes = await (
      await fetch(`${baseUrl}/parent/children`, {
        headers: { Authorization: `Bearer ${parentSarahToken}` },
      })
    ).json();
    expect(sarahChildrenRes.success).toBe(true);

    const sarahLeoLink = sarahChildrenRes.data.find((c: any) => c.child.username === 'leo_lion_7');
    expect(sarahLeoLink).toBeDefined();
    const sarahLinkId = sarahLeoLink.linkId;

    // Parent Alex tries to delete Sarah's link directly using Sarah's linkId
    const attackRes = await (
      await fetch(`${baseUrl}/parent/children/${sarahLinkId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${parentSecondToken}` },
      })
    ).json();

    // Must be rejected with 404 LINK_NOT_FOUND (scoped to caller's parent account)
    expect(attackRes.success).toBe(false);
    expect(attackRes.error.code).toBe('LINK_NOT_FOUND');

    // Verify Sarah's link is still intact
    const verifySarah = await prisma.parentChildLink.findUnique({
      where: { id: sarahLinkId },
    });
    expect(verifySarah).not.toBeNull();
  });

  it('Parent can unlink their own child', async () => {
    const res = await (
      await fetch(`${baseUrl}/parent/children/${leoUsername}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${parentSecondToken}` },
      })
    ).json();

    expect(res.success).toBe(true);
    expect(res.data.unlinked).toBe(true);

    // Verify Alex no longer has Leo in their children list
    const alexChildren = await (
      await fetch(`${baseUrl}/parent/children`, {
        headers: { Authorization: `Bearer ${parentSecondToken}` },
      })
    ).json();
    const stillHasLeo = alexChildren.data.some((c: any) => c.child.username === leoUsername);
    expect(stillHasLeo).toBe(false);
  });

  it('Parent Safety Controls: GET and PATCH settings with strict ownership and AuditLog verification', async () => {
    // Sarah manages her verified child Leo (leo_lion_7)
    // 1. Fetch current settings
    const getRes = await (
      await fetch(`${baseUrl}/parent/children/${leoUsername}/settings`, {
        headers: { Authorization: `Bearer ${parentSarahToken}` },
      })
    ).json();
    expect(getRes.success).toBe(true);
    expect(getRes.data.settings).toBeDefined();

    // 2. Unauthorized parent (Alex) CANNOT access Sarah's child's settings
    const unauthorizedGet = await (
      await fetch(`${baseUrl}/parent/children/${leoUsername}/settings`, {
        headers: { Authorization: `Bearer ${parentSecondToken}` },
      })
    ).json();
    expect(unauthorizedGet.success).toBe(false);
    expect(unauthorizedGet.error.code).toBe('FORBIDDEN_GUARDIAN_LINK');

    // 3. Sarah updates settings: disables comments and disables adding friends
    const patchRes = await (
      await fetch(`${baseUrl}/parent/children/${leoUsername}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${parentSarahToken}`,
        },
        body: JSON.stringify({
          canComment: false,
          canAddFriends: false,
          canReceiveFriendRequests: false,
          canWatchShortsReels: false,
          dailyLimitMinutes: 45,
        }),
      })
    ).json();
    expect(patchRes.success).toBe(true);
    expect(patchRes.data.settings.canComment).toBe(false);
    expect(patchRes.data.settings.canAddFriends).toBe(false);
    expect(patchRes.data.settings.canReceiveFriendRequests).toBe(false);
    expect(patchRes.data.settings.canWatchShortsReels).toBe(false);
    expect(patchRes.data.settings.dailyLimitMinutes).toBe(45);

    // 4. Verify AuditLog record was created
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        actorId: parentSarahId,
        action: 'PARENT_SETTING_CHANGED',
        entityType: 'ParentControl',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRecord).not.toBeNull();
  });

  it('Backend enforcement: Comment rejection when parent disabled comments', async () => {
    // Leo attempts to post a comment on approved content
    const feed = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();
    const approvedPost = feed.data[0];

    const commentRes = await (
      await fetch(`${baseUrl}/comments/${approvedPost.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${leoToken}`,
        },
        body: JSON.stringify({ text: 'Should be blocked by parent control' }),
      })
    ).json();

    expect(commentRes.success).toBe(false);
    expect(commentRes.error.code).toBe('COMMENTS_DISABLED_BY_PARENT');
  });

  it('Backend enforcement: Friend request rejection when parent disabled sending friends', async () => {
    // Clean any prior pending requests or friendships between Leo and Maya
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { sender: { username: leoUsername }, receiver: { username: mayaUsername } },
          { sender: { username: mayaUsername }, receiver: { username: leoUsername } },
        ],
      },
    });
    const [uA, uB] = [leoUsername, mayaUsername].sort();
    const userA = await prisma.user.findUnique({ where: { username: uA } });
    const userB = await prisma.user.findUnique({ where: { username: uB } });
    if (userA && userB) {
      await prisma.friendship.deleteMany({
        where: { userAId: userA.id, userBId: userB.id },
      });
    }

    // Leo attempts to send a friend request to Maya
    const friendRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${leoToken}`,
        },
        body: JSON.stringify({ targetUsername: mayaUsername }),
      })
    ).json();

    expect(friendRes.success).toBe(false);
    expect(friendRes.error.code).toBe('FRIENDS_DISABLED_BY_PARENT');
  });

  it('Backend enforcement: Inbound friend request rejection when target child cannot receive requests', async () => {
    // Login Maya (Explorer)
    const mayaLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    const mayaToken = mayaLogin.data.session.token;

    // Maya attempts to send a friend request to Leo (whose canReceiveFriendRequests is false)
    const sendToLeoRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mayaToken}`,
        },
        body: JSON.stringify({ targetUsername: leoUsername }),
      })
    ).json();

    expect(sendToLeoRes.success).toBe(false);
    expect(sendToLeoRes.error.code).toBe('TARGET_RECEIVE_FRIENDS_DISABLED');
  });

  it('Backend enforcement: Account Pause halts child platform interactions', async () => {
    // Sarah pauses Leo's account
    await fetch(`${baseUrl}/parent/children/${leoUsername}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentSarahToken}`,
      },
      body: JSON.stringify({
        isPaused: true,
        pauseReason: 'Bedtime and homework pause',
      }),
    });

    // Leo attempts any authenticated request (e.g. GET /feed or POST /reactions)
    const feedRes = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();

    expect(feedRes.success).toBe(false);
    expect(feedRes.error.code).toBe('ACCOUNT_PAUSED_BY_PARENT');
    expect(feedRes.error.message).toContain('Bedtime and homework pause');

    // Reset Leo's settings completely for all other tests
    await fetch(`${baseUrl}/parent/children/${leoUsername}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentSarahToken}`,
      },
      body: JSON.stringify({
        isPaused: false,
        canComment: true,
        canCreateContent: true,
        canAddFriends: true,
        canReceiveFriendRequests: true,
        canWatchShortsReels: true,
        dailyLimitMinutes: 60,
      }),
    });
  });
});
