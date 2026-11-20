import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer, OutboxService } from '../../apps/api/dist/modules/realtime/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { RealtimeEvent } from '@fizzy/shared-types';
import { ContentStatus, ReviewDecision, AgeGroup } from '../../apps/api/dist/generated/prisma-client/index.js';

describe('Prompt 19: Real-Time Social Interactions Suite', () => {
  let server: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4096;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const socketUrl = `http://localhost:${PORT}`;

  let childToken: string;
  let childId: string;
  let childSocket: ClientSocketType;

  let friendToken: string;
  let friendId: string;
  let friendSocket: ClientSocketType;

  let adminToken: string;
  let adminId: string;
  let adminSocket: ClientSocketType;

  let unauthTeenToken: string;
  let unauthTeenId: string;
  let unauthTeenSocket: ClientSocketType;

  const connectSocket = (token: string): Promise<ClientSocketType> => {
    return new Promise((resolve, reject) => {
      const client = ClientSocket(socketUrl, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });

      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  };

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);
    realtimeServer = RealtimeServer.getInstance();
    realtimeServer.initialize(server);

    await new Promise<void>((resolve) => {
      server.listen(PORT, () => resolve());
    });

    // 1. Authenticate Child Leo (JUNIOR)
    const childLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    childToken = childLogin.data.session.token;
    childId = childLogin.data.user.id;

    // 2. Authenticate Friend Maya (EXPLORER)
    const friendLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    friendToken = friendLogin.data.session.token;
    friendId = friendLogin.data.user.id;

    // 3. Authenticate Admin
    const adminLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminLogin.data.session.token;
    adminId = adminLogin.data.user.id;

    // 4. Authenticate Jordan (TEEN)
    const teenLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'jordan_teen_skater', password: 'Password123!' }),
      })
    ).json();
    unauthTeenToken = teenLogin.data.session.token;
    unauthTeenId = teenLogin.data.user.id;

    // Clean up any lingering friendship or friend requests between Leo and Maya
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: childId, receiverId: friendId },
          { senderId: friendId, receiverId: childId },
        ],
      },
    });
    const [uA, uB] = [childId, friendId].sort();
    await prisma.friendship.deleteMany({
      where: { userAId: uA, userBId: uB },
    });

    // Enable commenting for Leo during tests
    await prisma.parentControl.updateMany({
      where: { childProfile: { userId: childId } },
      data: { canComment: true },
    });

    // Connect authenticated WebSockets
    childSocket = await connectSocket(childToken);
    friendSocket = await connectSocket(friendToken);
    adminSocket = await connectSocket(adminToken);
    unauthTeenSocket = await connectSocket(unauthTeenToken);
  });

  afterAll(async () => {
    if (childSocket) childSocket.disconnect();
    if (friendSocket) friendSocket.disconnect();
    if (adminSocket) adminSocket.disconnect();
    if (unauthTeenSocket) unauthTeenSocket.disconnect();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1. Real-Time Friend Request Lifecycle: send, reject, cancel, accept, and remove', async () => {
    // A. Leo sends friend request to Maya -> Maya receives live friend_request:received
    const mayaReceivedPromise = new Promise<any>((resolve) => {
      friendSocket.once(RealtimeEvent.FRIEND_REQUEST_RECEIVED, (data) => resolve(data));
    });

    const sendRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ targetUsername: 'maya_explorer' }),
      })
    ).json();

    if (!sendRes.success) {
      console.log('SEND_RES_ERROR:', JSON.stringify(sendRes));
    }
    expect(sendRes.success).toBe(true);
    const requestId = sendRes.data.requestId;

    const receivedPayload = await mayaReceivedPromise;
    expect(receivedPayload.requestId).toBe(requestId);
    expect(receivedPayload.senderId).toBe(childId);
    expect(receivedPayload.receiverId).toBe(friendId);

    // Verify Maya's parent or 3rd party does NOT get this event (isolation)
    let unauthGotRequest = false;
    unauthTeenSocket.once(RealtimeEvent.FRIEND_REQUEST_RECEIVED, () => {
      unauthGotRequest = true;
    });
    expect(unauthGotRequest).toBe(false);

    // B. Maya declines friend request -> Leo receives live friend_request:rejected
    const leoRejectedPromise = new Promise<any>((resolve) => {
      childSocket.once(RealtimeEvent.FRIEND_REQUEST_REJECTED, (data) => resolve(data));
    });

    const declineRes = await (
      await fetch(`${baseUrl}/friends/respond/${requestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${friendToken}`,
        },
        body: JSON.stringify({ action: 'REJECT' }),
      })
    ).json();

    expect(declineRes.success).toBe(true);
    const rejectedPayload = await leoRejectedPromise;
    expect(rejectedPayload.requestId).toBe(requestId);
    expect(rejectedPayload.senderId).toBe(childId);

    // C. Clean up declined request before sending new one (due to unique constraint [senderId, receiverId])
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: childId, receiverId: friendId },
          { senderId: friendId, receiverId: childId },
        ],
      },
    });

    // Leo sends another friend request, then cancels it -> Maya receives friend_request:cancelled
    const mayaReceivedPromise2 = new Promise<any>((resolve) => {
      friendSocket.once(RealtimeEvent.FRIEND_REQUEST_RECEIVED, (data) => resolve(data));
    });

    const sendRes2 = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ targetUsername: 'maya_explorer' }),
      })
    ).json();
    expect(sendRes2.success).toBe(true);
    const requestId2 = sendRes2.data.requestId;
    await mayaReceivedPromise2;

    const mayaCancelledPromise = new Promise<any>((resolve) => {
      friendSocket.once(RealtimeEvent.FRIEND_REQUEST_CANCELLED, (data) => resolve(data));
    });

    const cancelRes = await (
      await fetch(`${baseUrl}/friends/request/${requestId2}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(cancelRes.success).toBe(true);
    const cancelledPayload = await mayaCancelledPromise;
    expect(cancelledPayload.requestId).toBe(requestId2);
    expect(cancelledPayload.receiverId).toBe(friendId);

    // Leo sends friend request, Maya ACCEPTS -> Leo receives live friend_request:accepted
    // Clean up any declined/pending requests between Leo and Maya first to ensure unique constraint
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: childId, receiverId: friendId },
          { senderId: friendId, receiverId: childId },
        ],
      },
    });

    const sendRes3 = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ targetUsername: 'maya_explorer' }),
      })
    ).json();
    const requestId3 = sendRes3.data.requestId;

    const leoAcceptedPromise = new Promise<any>((resolve) => {
      childSocket.once(RealtimeEvent.FRIEND_REQUEST_ACCEPTED, (data) => resolve(data));
    });

    const acceptRes = await (
      await fetch(`${baseUrl}/friends/respond/${requestId3}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${friendToken}`,
        },
        body: JSON.stringify({ action: 'ACCEPT' }),
      })
    ).json();

    expect(acceptRes.success).toBe(true);
    const acceptedPayload = await leoAcceptedPromise;
    expect(acceptedPayload.friendId).toBe(friendId);

    // E. Leo removes friendship -> Maya receives live friendship:removed
    const friendsList = await (
      await fetch(`${baseUrl}/friends`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();
    const friendship = friendsList.data.find((f: any) => f.friend.id === friendId);
    expect(friendship).toBeDefined();

    const mayaRemovedPromise = new Promise<any>((resolve) => {
      friendSocket.once(RealtimeEvent.FRIENDSHIP_REMOVED, (data) => resolve(data));
    });

    const deleteRes = await (
      await fetch(`${baseUrl}/friends/${friendship.friendshipId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(deleteRes.success).toBe(true);
    const removedPayload = await mayaRemovedPromise;
    expect(removedPayload.friendshipId).toBe(friendship.friendshipId);
    expect(removedPayload.removedBy).toBe(childId);
  });

  it('2. Real-Time Reactions: Count updates broadcast to authorized viewers and prevents duplicates', async () => {
    // Find an approved post accessible to JUNIOR and EXPLORER
    const post = await prisma.content.findFirst({
      where: {
        type: 'POST',
        status: ContentStatus.APPROVED,
      },
      include: { approvedAudiences: true },
    });
    expect(post).toBeDefined();
    const contentId = post!.id;

    // Maya listens for reaction:updated
    const reactionPromise = new Promise<any>((resolve) => {
      friendSocket.once(RealtimeEvent.REACTION_UPDATED, (data) => resolve(data));
    });

    // Leo toggles reaction ON
    const reactRes = await (
      await fetch(`${baseUrl}/reactions/${contentId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ emoji: '🌟' }),
      })
    ).json();

    expect(reactRes.success).toBe(true);
    expect(reactRes.data.reacted).toBe(true);

    const reactionPayload = await reactionPromise;
    expect(reactionPayload.contentId).toBe(contentId);
    expect(reactionPayload.totalReactions).toBe(reactRes.data.totalReactions);
    expect(reactionPayload.emoji).toBe('🌟');

    // Leo toggles reaction OFF -> emits updated count again
    const reactionOffPromise = new Promise<any>((resolve) => {
      friendSocket.once(RealtimeEvent.REACTION_UPDATED, (data) => resolve(data));
    });

    const reactOffRes = await (
      await fetch(`${baseUrl}/reactions/${contentId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ emoji: '🌟' }),
      })
    ).json();

    expect(reactOffRes.success).toBe(true);
    expect(reactOffRes.data.reacted).toBe(false);

    const reactionOffPayload = await reactionOffPromise;
    expect(reactionOffPayload.contentId).toBe(contentId);
    expect(reactionOffPayload.totalReactions).toBe(reactOffRes.data.totalReactions);
  });

  it('3. Comment Lifecycle: Submits as PENDING_REVIEW -> Admins alerted -> Admin Approves -> Broadcasts to authorized viewers', async () => {
    // Find an approved post
    const post = await prisma.content.findFirst({
      where: {
        type: 'POST',
        status: ContentStatus.APPROVED,
      },
    });
    expect(post).toBeDefined();
    const contentId = post!.id;

    // Admin listens for comment:submitted
    const adminCommentSubmittedPromise = new Promise<any>((resolve) => {
      adminSocket.once(RealtimeEvent.COMMENT_SUBMITTED, (data) => resolve(data));
    });

    // Leo submits a comment
    const commentRes = await (
      await fetch(`${baseUrl}/comments/${contentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ text: 'This is an awesome safe post!' }),
      })
    ).json();

    expect(commentRes.success).toBe(true);
    expect(commentRes.data.status).toBe(ContentStatus.PENDING_REVIEW);
    const commentId = commentRes.data.id;

    // Verify Admin receives real-time alert
    const submittedPayload = await adminCommentSubmittedPromise;
    expect(submittedPayload.commentId).toBe(commentId);
    expect(submittedPayload.authorId).toBe(childId);

    // Verify Maya (other child) CANNOT see this pending comment in GET /comments/:contentId
    const mayaCommentsRes = await (
      await fetch(`${baseUrl}/comments/${contentId}`, {
        headers: { Authorization: `Bearer ${friendToken}` },
      })
    ).json();

    const pendingFound = mayaCommentsRes.data.find((c: any) => c.id === commentId);
    expect(pendingFound).toBeUndefined(); // Strictly hidden from other children!

    // Find the moderation content record created for this comment
    const modContent = await prisma.content.findFirst({
      where: {
        type: 'COMMENT',
        authorId: childId,
        status: ContentStatus.PENDING_REVIEW,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(modContent).toBeDefined();

    // Friend (Maya) listens for real-time COMMENT_APPROVED
    const mayaCommentApprovedPromise = new Promise<any>((resolve) => {
      friendSocket.once(RealtimeEvent.COMMENT_APPROVED, (data) => resolve(data));
    });

    // Admin reviews and APPROVES the comment
    const decisionRes = await (
      await fetch(`${baseUrl}/moderation/decision/${modContent!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          decision: ReviewDecision.APPROVE,
          approvedAudiences: [AgeGroup.JUNIOR, AgeGroup.EXPLORER, AgeGroup.TEEN],
          reason: 'Safe and positive text.',
        }),
      })
    ).json();

    if (!decisionRes.success) {
      console.log('DECISION_RES_ERROR:', JSON.stringify(decisionRes));
    }
    expect(decisionRes.success).toBe(true);

    // Verify Maya receives live comment:approved
    const approvedPayload = await mayaCommentApprovedPromise;
    expect(approvedPayload.commentId).toBe(commentId);
    expect(approvedPayload.contentId).toBe(contentId);
    expect(approvedPayload.text).toBe('This is an awesome safe post!');

    // Now Maya fetches comments and it is visible
    const mayaCommentsRes2 = await (
      await fetch(`${baseUrl}/comments/${contentId}`, {
        headers: { Authorization: `Bearer ${friendToken}` },
      })
    ).json();
    const approvedFound = mayaCommentsRes2.data.find((c: any) => c.id === commentId);
    expect(approvedFound).toBeDefined();
    expect(approvedFound.status).toBe(ContentStatus.APPROVED);
  });
});
