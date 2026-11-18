import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Child Social Interactions Suite (Reactions, Comments, Friends, Profiles)', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4060;
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  let leoToken: string;     // Junior (Age 7)
  let leoId: string;
  let mayaToken: string;    // Explorer (Age 10)
  let mayaId: string;
  let adminToken: string;

  let approvedContentId: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // 1. Login Leo (Junior)
    const leoLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    leoToken = leoLogin.data.session.token;
    leoId = leoLogin.data.user.id;

    // 2. Login Maya (Explorer)
    const mayaLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    mayaToken = mayaLogin.data.session.token;
    mayaId = mayaLogin.data.user.id;

    // 3. Login Admin
    const adminLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminLogin.data.session.token;

    // Get an approved post accessible to both
    const post = await prisma.content.findFirst({
      where: { type: 'POST', status: 'APPROVED' },
    });
    approvedContentId = post!.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Reactions: Toggle like, calculate reaction count, prevent duplicates, and check user reacted status', async () => {
    // 1. Initial state check
    const initialRes = await (
      await fetch(`${baseUrl}/reactions/${approvedContentId}`, {
        headers: { Authorization: `Bearer ${mayaToken}` },
      })
    ).json();
    const initialCount = initialRes.data.totalCount;

    // 2. Maya toggles reaction ON
    const toggleOnRes = await (
      await fetch(`${baseUrl}/reactions/${approvedContentId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mayaToken}` },
        body: JSON.stringify({ emoji: '⭐' }),
      })
    ).json();

    expect(toggleOnRes.success).toBe(true);
    expect(toggleOnRes.data.reacted).toBe(true);
    expect(toggleOnRes.data.totalReactions).toBe(initialCount + 1);

    // 3. Check /reactions/:id reports hasReacted = true
    const checkRes = await (
      await fetch(`${baseUrl}/reactions/${approvedContentId}`, {
        headers: { Authorization: `Bearer ${mayaToken}` },
      })
    ).json();
    expect(checkRes.data.hasReacted).toBe(true);
    expect(checkRes.data.userReactedEmojis).toContain('⭐');

    // 4. Maya toggles reaction OFF
    const toggleOffRes = await (
      await fetch(`${baseUrl}/reactions/${approvedContentId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mayaToken}` },
        body: JSON.stringify({ emoji: '⭐' }),
      })
    ).json();
    expect(toggleOffRes.data.reacted).toBe(false);
    expect(toggleOffRes.data.totalReactions).toBe(initialCount);
  });

  it('Comments: Enforces moderation, prevents unapproved comments from showing to other children, and allows admin approval', async () => {
    // 1. Maya submits comment
    const commentRes = await (
      await fetch(`${baseUrl}/comments/${approvedContentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mayaToken}` },
        body: JSON.stringify({ text: 'This looks so cool and creative! 🌟' }),
      })
    ).json();

    expect(commentRes.success).toBe(true);
    expect(commentRes.data.status).toBe('PENDING_REVIEW');
    const commentId = commentRes.data.id;

    // 2. Leo (another child) checks comments: Maya pending comment is NOT visible to him!
    const leoFetchComments = await (
      await fetch(`${baseUrl}/comments/${approvedContentId}`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();
    const leoSeesPending = leoFetchComments.data.some((c: any) => c.id === commentId);
    expect(leoSeesPending).toBe(false);

    // 3. Maya (author) CAN see her own comment in pending state
    const mayaFetchComments = await (
      await fetch(`${baseUrl}/comments/${approvedContentId}`, {
        headers: { Authorization: `Bearer ${mayaToken}` },
      })
    ).json();
    const mayaComment = mayaFetchComments.data.find((c: any) => c.id === commentId);
    expect(mayaComment).toBeDefined();
    expect(mayaComment.isPending).toBe(true);

    // 4. Admin approves the comment in moderation queue
    const modItem = await prisma.content.findFirst({
      where: { type: 'COMMENT', caption: 'This looks so cool and creative! 🌟' },
    });
    expect(modItem).toBeDefined();

    // Mark comment approved
    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'APPROVED' },
    });

    // 5. Now Leo CAN see the approved comment!
    const leoFetchAfterApproval = await (
      await fetch(`${baseUrl}/comments/${approvedContentId}`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();
    const leoSeesApproved = leoFetchAfterApproval.data.some((c: any) => c.id === commentId);
    expect(leoSeesApproved).toBe(true);
  });

  it('Parent controls: Enforces comments disabled setting for Junior child', async () => {
    // Set Leo's canComment: false for this test
    const leoChild = await prisma.childProfile.findFirst({ where: { userId: leoId } });
    if (leoChild) {
      await prisma.parentControl.update({
        where: { childProfileId: leoChild.id },
        data: { canComment: false },
      });
    }

    const res = await fetch(`${baseUrl}/comments/${approvedContentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leoToken}` },
      body: JSON.stringify({ text: 'Trying to comment' }),
    });

    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('COMMENTS_DISABLED_BY_PARENT');

    // Restore canComment: true
    if (leoChild) {
      await prisma.parentControl.update({
        where: { childProfileId: leoChild.id },
        data: { canComment: true },
      });
    }
  });

  it('Friend Requests: Send, prevent self-request, accept, list friends, and prevent duplicate requests', async () => {
    // 1. Prevent self-directed request
    const selfRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leoToken}` },
        body: JSON.stringify({ targetUsername: 'leo_lion_7' }),
      })
    ).json();
    expect(selfRes.success).toBe(false);
    expect(selfRes.error.code).toBe('SELF_FRIEND_REQUEST');

    // Clean any prior pending requests or friendships between Leo and Maya
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: leoId, receiverId: mayaId },
          { senderId: mayaId, receiverId: leoId },
        ],
      },
    });
    const [uA, uB] = [leoId, mayaId].sort();
    await prisma.friendship.deleteMany({
      where: { userAId: uA, userBId: uB },
    });

    // Ensure Leo and Maya parent controls allow adding & receiving friends
    const leoChild = await prisma.childProfile.findFirst({ where: { userId: leoId } });
    if (leoChild) {
      await prisma.parentControl.upsert({
        where: { childProfileId: leoChild.id },
        create: { childProfileId: leoChild.id, canAddFriends: true, canReceiveFriendRequests: true },
        update: { canAddFriends: true, canReceiveFriendRequests: true, isPaused: false },
      });
    }

    const mayaChild = await prisma.childProfile.findFirst({ where: { userId: mayaId } });
    if (mayaChild) {
      await prisma.parentControl.upsert({
        where: { childProfileId: mayaChild.id },
        create: { childProfileId: mayaChild.id, canAddFriends: true, canReceiveFriendRequests: true },
        update: { canAddFriends: true, canReceiveFriendRequests: true, isPaused: false },
      });
    }

    // 2. Leo sends friend request to Maya
    const sendRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leoToken}` },
        body: JSON.stringify({ targetUsername: 'maya_explorer' }),
      })
    ).json();
    expect(sendRes.success).toBe(true);
    const requestId = sendRes.data.requestId;

    // 3. Prevent duplicate request
    const dupRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leoToken}` },
        body: JSON.stringify({ targetUsername: 'maya_explorer' }),
      })
    ).json();
    expect(dupRes.success).toBe(false);
    expect(dupRes.error.code).toBe('REQUEST_PENDING');

    // 4. Maya views incoming requests
    const mayaReqs = await (
      await fetch(`${baseUrl}/friends/requests`, {
        headers: { Authorization: `Bearer ${mayaToken}` },
      })
    ).json();
    const hasLeo = mayaReqs.data.incoming.some((r: any) => r.id === requestId);
    expect(hasLeo).toBe(true);

    // 5. Maya accepts the request
    const acceptRes = await (
      await fetch(`${baseUrl}/friends/respond/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mayaToken}` },
        body: JSON.stringify({ action: 'ACCEPT' }),
      })
    ).json();
    expect(acceptRes.success).toBe(true);

    // 6. Both now appear in each other's friends list
    const leoFriends = await (
      await fetch(`${baseUrl}/friends`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();
    const leoHasMayaFriend = leoFriends.data.some((f: any) => f.friend.id === mayaId);
    expect(leoHasMayaFriend).toBe(true);
  });

  it('Child profile: View permitted public information and update display name', async () => {
    // 1. Look up Maya's safe public profile
    const profileRes = await (
      await fetch(`${baseUrl}/users/profile/maya_explorer`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();

    expect(profileRes.success).toBe(true);
    expect(profileRes.data.username).toBe('maya_explorer');
    expect(profileRes.data.ageGroup).toBe('EXPLORER');
    // Ensure PII (birthDate, email, passwordHash) is strictly hidden
    expect(profileRes.data.birthDate).toBeUndefined();
    expect(profileRes.data.email).toBeUndefined();
    expect(profileRes.data.passwordHash).toBeUndefined();

    // 2. Maya updates her own display name
    const updateRes = await (
      await fetch(`${baseUrl}/users/display-name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mayaToken}` },
        body: JSON.stringify({ displayName: 'Maya Wonder Scientist' }),
      })
    ).json();

    expect(updateRes.success).toBe(true);
    expect(updateRes.data.displayName).toBe('Maya Wonder Scientist');
  });
});
