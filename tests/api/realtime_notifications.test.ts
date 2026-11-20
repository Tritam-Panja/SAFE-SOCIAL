import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer, OutboxService } from '../../apps/api/dist/modules/realtime/index.js';
import { NotificationService } from '../../apps/api/dist/modules/notifications/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { RealtimeEvent } from '@fizzy/shared-types';

describe('Prompt 18: Complete Database-Backed Real-Time Notification System Suite', () => {
  let server: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4095;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const socketUrl = `http://localhost:${PORT}`;

  let childToken: string;
  let childId: string;
  let childSocket: ClientSocketType;

  let friendToken: string;
  let friendId: string;
  let friendSocket: ClientSocketType;

  let parentToken: string;
  let parentId: string;
  let parentSocket: ClientSocketType;

  let adminToken: string;
  let adminId: string;

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

    // Connect online sockets
    childSocket = await connectSocket(childToken);
    friendSocket = await connectSocket(friendToken);
    parentSocket = await connectSocket(parentToken);
  });

  afterAll(async () => {
    childSocket?.disconnect();
    friendSocket?.disconnect();
    parentSocket?.disconnect();

    await realtimeServer.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  // =========================================================================
  // SCENARIO 1: Real-time Online Notification Delivery (Friend Request Received)
  // =========================================================================
  it('1. Online delivery: Recipient receives notification immediately via Socket.IO and DB persistence', async () => {
    let receivedPayload: any = null;
    const notifPromise = new Promise<void>((resolve) => {
      friendSocket.on(RealtimeEvent.NOTIFICATION_CREATED, (payload) => {
        receivedPayload = payload;
        resolve();
      });
    });

    // Leo creates and sends notification to Maya
    const notif = await NotificationService.createNotification({
      userId: friendId,
      type: 'FRIEND_REQUEST',
      title: 'New Friend Request! 🤝',
      message: 'Leo wants to be friends on Fizzy!',
      referenceId: 'req-test-123',
    });

    await notifPromise;

    // A. Verify Socket Delivery
    expect(receivedPayload).toBeDefined();
    expect(receivedPayload.id).toBe(notif.id);
    expect(receivedPayload.userId).toBe(friendId);
    expect(receivedPayload.title).toBe('New Friend Request! 🤝');

    // B. Verify DB Persistence
    const saved = await prisma.notification.findUnique({
      where: { id: notif.id },
    });
    expect(saved).toBeDefined();
    expect(saved?.isRead).toBe(false);
    expect(saved?.type).toBe('FRIEND_REQUEST');

    // Clean up listener
    friendSocket.off(RealtimeEvent.NOTIFICATION_CREATED);
  });

  // =========================================================================
  // SCENARIO 2: Offline Notification Persistence & Subsequent Retrieval
  // =========================================================================
  it('2. Offline persistence: Recipient offline does not lose notifications and retrieves them on reconnect', async () => {
    // A. Disconnect Maya's socket to simulate offline
    friendSocket.disconnect();
    expect(friendSocket.connected).toBe(false);

    // B. Send an offline notification (Parent / Safety Alert)
    const offlineNotif = await NotificationService.createNotification({
      userId: friendId,
      type: 'PARENT_ALERT',
      title: 'Account Settings Updated',
      message: 'Your parent adjusted your daily screen time setting.',
      referenceId: 'parent-control-xyz',
    });

    // C. Verify persisted in DB even though user is disconnected
    const dbNotif = await prisma.notification.findUnique({
      where: { id: offlineNotif.id },
    });
    expect(dbNotif).toBeDefined();
    expect(dbNotif?.isRead).toBe(false);

    // D. User reconnects and queries REST API
    const restRes = await (
      await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${friendToken}` },
      })
    ).json();

    expect(restRes.success).toBe(true);
    expect(restRes.meta.unreadCount).toBeGreaterThan(0);
    const foundOfflineItem = restRes.data.some((n: any) => n.id === offlineNotif.id);
    expect(foundOfflineItem).toBe(true);

    // Reconnect socket for next tests
    friendSocket = await connectSocket(friendToken);
  });

  // =========================================================================
  // SCENARIO 3: Strict Recipient Isolation & Security Boundary
  // =========================================================================
  it('3. Security: Users cannot access or mark other users notifications as read', async () => {
    // Create notification owned by Child (Leo)
    const childNotif = await NotificationService.createNotification({
      userId: childId,
      type: 'CONTENT_APPROVED',
      title: 'Creation Approved!',
      message: 'Your drawing is safe and published.',
      referenceId: 'content-drawing-123',
    });

    // Maya (different user) attempts to mark Leo's notification as read
    const hijackRes = await (
      await fetch(`${baseUrl}/notifications/${childNotif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${friendToken}` },
      })
    ).json();

    expect(hijackRes.success).toBe(false);
    expect(hijackRes.error.code).toBe('NOT_FOUND');

    // Verify Leo's notification remains unread
    const notifAfter = await prisma.notification.findUnique({
      where: { id: childNotif.id },
    });
    expect(notifAfter?.isRead).toBe(false);
  });

  // =========================================================================
  // SCENARIO 4: Mark as Read & Mark All as Read
  // =========================================================================
  it('4. Read status synchronization: Mark as read and mark-all-read update database and unread count', async () => {
    // 1. Mark single notification as read by legitimate owner (Leo)
    const myNotifsRes = await (
      await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();
    const firstUnread = myNotifsRes.data.find((n: any) => !n.isRead);

    if (firstUnread) {
      const readRes = await (
        await fetch(`${baseUrl}/notifications/${firstUnread.id}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${childToken}` },
        })
      ).json();
      expect(readRes.success).toBe(true);
      expect(readRes.data.isRead).toBe(true);
    }

    // 2. Mark ALL as read
    const markAllRes = await (
      await fetch(`${baseUrl}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(markAllRes.success).toBe(true);
    expect(markAllRes.data.markedAsRead).toBe(true);

    // Verify unread count is now 0
    const finalNotifsRes = await (
      await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(finalNotifsRes.meta.unreadCount).toBe(0);
  });
});
