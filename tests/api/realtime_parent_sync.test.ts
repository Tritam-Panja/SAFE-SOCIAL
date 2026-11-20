import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer } from '../../apps/api/dist/modules/realtime/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { RealtimeEvent } from '@fizzy/shared-types';

describe('Prompt 20: Real-Time Parent and Child Synchronization Suite', () => {
  let server: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4098;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const socketUrl = `http://localhost:${PORT}`;

  let parentToken: string;
  let parentId: string;
  let parentSocket: ClientSocketType;

  let childTokenDevice1: string;
  let childTokenDevice2: string;
  let childId: string;
  let childProfileId: string;
  let childSocketDevice1: ClientSocketType;
  let childSocketDevice2: ClientSocketType;

  let otherChildToken: string;
  let otherChildId: string;
  let otherChildSocket: ClientSocketType;

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

    // 1. Authenticate Parent Sarah
    const parentLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'guardian_sarah', password: 'Password123!' }),
      })
    ).json();
    parentToken = parentLogin.data.session.token;
    parentId = parentLogin.data.user.id;

    // 2. Authenticate Child Leo (Device 1)
    const childLogin1 = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    childTokenDevice1 = childLogin1.data.session.token;
    childId = childLogin1.data.user.id;
    childProfileId = childLogin1.data.user.childProfile.id;

    // 3. Authenticate Child Leo (Device 2 - simultaneous active session)
    const childLogin2 = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    childTokenDevice2 = childLogin2.data.session.token;

    // 4. Authenticate Jordan (TEEN - Unlinked child to test isolation)
    const teenLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'jordan_teen_skater', password: 'Password123!' }),
      })
    ).json();
    otherChildToken = teenLogin.data.session.token;
    otherChildId = teenLogin.data.user.id;

    // Ensure clean parent controls baseline for Leo
    await prisma.parentControl.upsert({
      where: { childProfileId },
      create: {
        childProfileId,
        isPaused: false,
        canComment: true,
        canAddFriends: true,
        canWatchShortsReels: true,
        canCreateContent: true,
      },
      update: {
        isPaused: false,
        canComment: true,
        canAddFriends: true,
        canWatchShortsReels: true,
        canCreateContent: true,
      },
    });

    // Connect authenticated WebSockets
    parentSocket = await connectSocket(parentToken);
    childSocketDevice1 = await connectSocket(childTokenDevice1);
    childSocketDevice2 = await connectSocket(childTokenDevice2);
    otherChildSocket = await connectSocket(otherChildToken);
  });

  afterAll(async () => {
    if (parentSocket) parentSocket.disconnect();
    if (childSocketDevice1) childSocketDevice1.disconnect();
    if (childSocketDevice2) childSocketDevice2.disconnect();
    if (otherChildSocket) otherChildSocket.disconnect();

    // Reset Leo's parent controls to clean unpaused state
    await prisma.parentControl.updateMany({
      where: { childProfileId },
      data: { isPaused: false, canComment: true, canAddFriends: true },
    });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1. Parent modifies control -> All active child devices receive live update; unrelated child does not', async () => {
    // Promises for both of Leo's devices to receive live PARENT_CONTROL_UPDATED event
    const device1UpdatePromise = new Promise<any>((resolve) => {
      childSocketDevice1.once(RealtimeEvent.PARENT_CONTROL_UPDATED, (data) => resolve(data));
    });
    const device2UpdatePromise = new Promise<any>((resolve) => {
      childSocketDevice2.once(RealtimeEvent.PARENT_CONTROL_UPDATED, (data) => resolve(data));
    });

    // Unrelated child socket listener to verify strict isolation
    let unrelatedChildGotEvent = false;
    otherChildSocket.once(RealtimeEvent.PARENT_CONTROL_UPDATED, () => {
      unrelatedChildGotEvent = true;
    });

    // Parent Sarah disables friend requests and comments for Leo
    const updateRes = await (
      await fetch(`${baseUrl}/parent/children/${childId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${parentToken}`,
        },
        body: JSON.stringify({
          canAddFriends: false,
          canComment: false,
        }),
      })
    ).json();

    expect(updateRes.success).toBe(true);
    expect(updateRes.data.settings.canAddFriends).toBe(false);
    expect(updateRes.data.settings.canComment).toBe(false);

    // Verify both devices received the real-time event
    const payloadDev1 = await device1UpdatePromise;
    const payloadDev2 = await device2UpdatePromise;

    expect(payloadDev1.childId).toBe(childId);
    expect(payloadDev1.settings.canAddFriends).toBe(false);
    expect(payloadDev1.settings.canComment).toBe(false);

    expect(payloadDev2.childId).toBe(childId);
    expect(payloadDev2.settings.canAddFriends).toBe(false);

    // Verify unrelated child did not receive Leo's parent control event
    expect(unrelatedChildGotEvent).toBe(false);

    // Verify audit log was recorded in PostgreSQL
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        actorId: parentId,
        action: 'PARENT_SETTING_CHANGED',
        entityType: 'ParentControl',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditLog).toBeDefined();
    expect((auditLog?.details as any).canAddFriends).toBe(false);
  });

  it('2. Backend immediately enforces changed settings on subsequent requests (friend requests and comments)', async () => {
    // A. Leo tries to send a friend request -> must be rejected with 403
    const sendFriendRes = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childTokenDevice1}`,
        },
        body: JSON.stringify({ targetUsername: 'maya_explorer' }),
      })
    ).json();

    expect(sendFriendRes.success).toBe(false);
    expect(sendFriendRes.error.code).toBe('FRIENDS_DISABLED_BY_PARENT');

    // Also on device 2
    const sendFriendRes2 = await (
      await fetch(`${baseUrl}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childTokenDevice2}`,
        },
        body: JSON.stringify({ targetUsername: 'maya_explorer' }),
      })
    ).json();

    expect(sendFriendRes2.success).toBe(false);
    expect(sendFriendRes2.error.code).toBe('FRIENDS_DISABLED_BY_PARENT');

    // B. Leo tries to submit a comment -> must be rejected with 403
    const approvedPost = await prisma.content.findFirst({
      where: { type: 'POST', status: 'APPROVED' },
    });
    expect(approvedPost).toBeDefined();

    const commentRes = await (
      await fetch(`${baseUrl}/comments/${approvedPost!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childTokenDevice1}`,
        },
        body: JSON.stringify({ text: 'Trying to comment while disabled' }),
      })
    ).json();

    expect(commentRes.success).toBe(false);
    expect(commentRes.error.code).toBe('COMMENTS_DISABLED_BY_PARENT');
  });

  it('3. Pausing an account immediately restricts normal account activity and alerts child devices', async () => {
    const device1PausePromise = new Promise<any>((resolve) => {
      childSocketDevice1.once(RealtimeEvent.PARENT_CONTROL_UPDATED, (data) => resolve(data));
    });

    // Parent pauses Leo's account
    const pauseRes = await (
      await fetch(`${baseUrl}/parent/children/${childId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${parentToken}`,
        },
        body: JSON.stringify({
          isPaused: true,
          pauseReason: 'Time for dinner and homework!',
        }),
      })
    ).json();

    expect(pauseRes.success).toBe(true);
    expect(pauseRes.data.settings.isPaused).toBe(true);

    const pausePayload = await device1PausePromise;
    expect(pausePayload.settings.isPaused).toBe(true);
    expect(pausePayload.settings.pauseReason).toBe('Time for dinner and homework!');

    // Leo's normal API requests now blocked by requireAuth middleware
    const feedRes = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${childTokenDevice1}` },
      })
    ).json();

    expect(feedRes.success).toBe(false);
    expect(feedRes.error.code).toBe('ACCOUNT_PAUSED_BY_PARENT');
    expect(feedRes.error.message).toContain('dinner and homework');

    // Same rejection for device 2
    const friendsRes = await (
      await fetch(`${baseUrl}/friends`, {
        headers: { Authorization: `Bearer ${childTokenDevice2}` },
      })
    ).json();

    expect(friendsRes.success).toBe(false);
    expect(friendsRes.error.code).toBe('ACCOUNT_PAUSED_BY_PARENT');
  });

  it('4. Security: Child or unauthorized user cannot access or modify parent controls', async () => {
    // Resume Leo's account from parent first
    const resumeRes = await (
      await fetch(`${baseUrl}/parent/children/${childId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${parentToken}`,
        },
        body: JSON.stringify({
          isPaused: false,
          canAddFriends: true,
          canComment: true,
        }),
      })
    ).json();

    expect(resumeRes.success).toBe(true);
    expect(resumeRes.data.settings.isPaused).toBe(false);

    // Child attempts to patch their own settings while active
    const childTamperRes = await (
      await fetch(`${baseUrl}/parent/children/${childId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childTokenDevice1}`,
        },
        body: JSON.stringify({ isPaused: false, canAddFriends: true }),
      })
    ).json();

    // Must be rejected with 403 FORBIDDEN (requires PARENT role)
    expect(childTamperRes.success).toBe(false);
    expect(childTamperRes.error.code).toBe('FORBIDDEN');

    // Also verify another child (Jordan) cannot patch Leo's controls
    const otherChildTamperRes = await (
      await fetch(`${baseUrl}/parent/children/${childId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherChildToken}`,
        },
        body: JSON.stringify({ isPaused: true }),
      })
    ).json();

    expect(otherChildTamperRes.success).toBe(false);
    expect(otherChildTamperRes.error.code).toBe('FORBIDDEN');

    // Verify Leo can access feed normally
    const feedResAgain = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${childTokenDevice1}` },
      })
    ).json();

    expect(feedResAgain.success).toBe(true);
  });
});
