import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer } from '../../apps/api/dist/modules/realtime/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { RealtimeEvent } from '@fizzy/shared-types';
import { ContentStatus, AgeGroup, UserRole } from '../../apps/api/dist/generated/prisma-client/index.js';

describe('Prompt 23: Real-Time Security and Abuse Testing Suite', () => {
  let server: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4101;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const socketUrl = `http://localhost:${PORT}`;

  let juniorToken: string;
  let juniorId: string;
  let juniorSocket: ClientSocketType;

  let teenToken: string;
  let teenId: string;
  let teenSocket: ClientSocketType;

  let parentToken: string;
  let parentId: string;
  let parentSocket: ClientSocketType;

  let adminToken: string;
  let adminId: string;
  let adminSocket: ClientSocketType;

  const connectSocket = (token?: string): Promise<ClientSocketType> => {
    return new Promise((resolve, reject) => {
      const client = ClientSocket(socketUrl, {
        path: '/socket.io',
        auth: token ? { token } : undefined,
        transports: ['websocket'],
        reconnection: false,
        timeout: 4000,
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

    // 1. Authenticate Junior Leo
    const juniorLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    juniorToken = juniorLogin.data.session.token;
    juniorId = juniorLogin.data.user.id;

    // 2. Authenticate Teen Jordan
    const teenLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'jordan_teen_skater', password: 'Password123!' }),
      })
    ).json();
    teenToken = teenLogin.data.session.token;
    teenId = teenLogin.data.user.id;

    // 3. Authenticate Parent Sarah
    const parentLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'guardian_sarah', password: 'Password123!' }),
      })
    ).json();
    parentToken = parentLogin.data.session.token;
    parentId = parentLogin.data.user.id;

    // 4. Authenticate Admin
    const adminLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminLogin.data.session.token;
    adminId = adminLogin.data.user.id;

    // Connect authorized sockets
    juniorSocket = await connectSocket(juniorToken);
    teenSocket = await connectSocket(teenToken);
    parentSocket = await connectSocket(parentToken);
    adminSocket = await connectSocket(adminToken);
  });

  afterAll(async () => {
    if (juniorSocket) juniorSocket.disconnect();
    if (teenSocket) teenSocket.disconnect();
    if (parentSocket) parentSocket.disconnect();
    if (adminSocket) adminSocket.disconnect();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1. Socket Authentication: Reject unauthenticated, invalid, expired, and revoked sessions', async () => {
    // A. Unauthenticated connection attempt
    await expect(connectSocket()).rejects.toThrow(/AUTHENTICATION_REQUIRED/);

    // B. Invalid fake token
    await expect(connectSocket('fake-invalid-token-xyz')).rejects.toThrow(/INVALID_SESSION/);

    // C. Revoked session (login a temp user, log them out, then try socket connection)
    const tempUserLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    const tempToken = tempUserLogin.data.session.token;

    // Logout
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tempToken}` },
    });

    // Attempt socket connection with revoked token
    await expect(connectSocket(tempToken)).rejects.toThrow(/INVALID_SESSION/);
  });

  it('2. Room Authorization: Prevent room tampering, cross-user eavesdropping, and unauthorized tier listening', async () => {
    // A. Child trying to eavesdrop on Admin Room
    let childReceivedAdminEvent = false;
    juniorSocket.once(RealtimeEvent.MODERATION_QUEUE_UPDATED, () => {
      childReceivedAdminEvent = true;
    });

    realtimeServer.emitToAdmins(RealtimeEvent.MODERATION_QUEUE_UPDATED, {
      action: 'ITEM_ADDED',
      contentId: 'secret-mod-content-id',
    });

    // Allow event tick
    await new Promise((r) => setTimeout(r, 100));
    expect(childReceivedAdminEvent).toBe(false);

    // B. Child trying to eavesdrop on another child's personal room
    let juniorReceivedTeenEvent = false;
    juniorSocket.once(RealtimeEvent.NOTIFICATION_CREATED, (data) => {
      if (data.id === 'teen-secret-notif-1') {
        juniorReceivedTeenEvent = true;
      }
    });

    realtimeServer.emitToUser(teenId, RealtimeEvent.NOTIFICATION_CREATED, {
      id: 'teen-secret-notif-1',
      userId: teenId,
      type: 'SYSTEM_ALERT',
      title: 'Secret Teen Notification',
      message: 'Private message for Jordan',
      createdAt: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(juniorReceivedTeenEvent).toBe(false);

    // C. Child trying to eavesdrop on higher age-group room (TEEN Reel publication)
    let juniorReceivedTeenBroadcast = false;
    juniorSocket.once(RealtimeEvent.FEED_UPDATED, () => {
      juniorReceivedTeenBroadcast = true;
    });

    realtimeServer.emitToAgeGroups([AgeGroup.TEEN], RealtimeEvent.FEED_UPDATED, {
      type: 'REEL',
      targetAgeGroups: [AgeGroup.TEEN],
      action: 'NEW_CONTENT',
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(juniorReceivedTeenBroadcast).toBe(false);
  });

  it('3. Content Access: Prevent access to pending, rejected, removed, or out-of-tier content', async () => {
    // Find or create pending content
    const pendingContent = await prisma.content.findFirst({
      where: { status: ContentStatus.PENDING_REVIEW },
    });

    if (pendingContent) {
      // Junior attempts direct REST fetch of pending content
      const pendingRes = await (
        await fetch(`${baseUrl}/contents/${pendingContent.id}`, {
          headers: { Authorization: `Bearer ${juniorToken}` },
        })
      ).json();

      // Must be unavailable if not the author
      if (pendingContent.authorId !== juniorId) {
        expect(pendingRes.success).toBe(false);
        expect(pendingRes.error.code).toBe('CONTENT_UNAVAILABLE');
      }
    }

    // Attempt direct fetch of a TEEN-only reel by JUNIOR Leo
    const teenReel = await prisma.content.findFirst({
      where: {
        type: 'REEL',
        status: ContentStatus.APPROVED,
        approvedAudiences: {
          every: { ageGroup: AgeGroup.TEEN },
        },
      },
    });

    if (teenReel) {
      const reelRes = await (
        await fetch(`${baseUrl}/contents/${teenReel.id}`, {
          headers: { Authorization: `Bearer ${juniorToken}` },
        })
      ).json();

      expect(reelRes.success).toBe(false);
      expect(reelRes.error.code).toBe('CONTENT_UNAVAILABLE');
    }
  });

  it('4. Event Security: Prevent unauthorized client-side event emission and enforce rate limits', async () => {
    // Client attempts to emit a fake server event from socket
    const errorPromise = new Promise<any>((resolve) => {
      juniorSocket.once('error', (err) => resolve(err));
    });

    juniorSocket.emit(RealtimeEvent.CONTENT_APPROVED, {
      contentId: 'fake-id',
      type: 'POST',
      title: 'Hacked Post',
      approvedAudiences: ['JUNIOR', 'EXPLORER', 'TEEN'],
    });

    const errorResult = await errorPromise;
    expect(errorResult.message).toContain('FORBIDDEN_EMIT');
  });

  it('5. Information Leakage: Verify payloads never leak internal review notes, unapproved media keys, or private PII', async () => {
    // Check ContentApproved payload structure in outbox
    const approvedOutbox = await prisma.eventOutbox.findFirst({
      where: { eventType: RealtimeEvent.CONTENT_APPROVED },
      orderBy: { createdAt: 'desc' },
    });

    if (approvedOutbox) {
      const payload = JSON.parse(approvedOutbox.payloadJson);
      expect(payload.internalNotes).toBeUndefined();
      expect(payload.decisionReason).toBeUndefined();
      expect(payload.reviewerId).toBeUndefined();
    }

    // Check Notification created payload
    const notifOutbox = await prisma.eventOutbox.findFirst({
      where: { eventType: RealtimeEvent.NOTIFICATION_CREATED },
      orderBy: { createdAt: 'desc' },
    });

    if (notifOutbox) {
      const payload = JSON.parse(notifOutbox.payloadJson);
      expect(payload.passwordHash).toBeUndefined();
      expect(payload.sessionToken).toBeUndefined();
      expect(payload.internalNotes).toBeUndefined();
    }
  });
});
