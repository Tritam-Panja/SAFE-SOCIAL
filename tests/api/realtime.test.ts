import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer } from '../../apps/api/dist/modules/realtime/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { RealtimeEvent } from '@fizzy/shared-types';

describe('Prompt 16: Centralized Authenticated Real-Time Infrastructure Suite', () => {
  let httpServer: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4097;
  const socketUrl = `http://localhost:${PORT}`;

  let childToken: string;
  let childId: string;
  let parentToken: string;
  let parentId: string;
  let adminToken: string;
  let adminId: string;

  const activeSockets: ClientSocketType[] = [];

  const connectClient = (token?: string, extraOptions = {}): Promise<ClientSocketType> => {
    return new Promise((resolve, reject) => {
      const client = ClientSocket(socketUrl, {
        path: '/socket.io',
        auth: token ? { token } : undefined,
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
        ...extraOptions,
      });

      activeSockets.push(client);

      client.on('connect', () => {
        resolve(client);
      });

      client.on('connect_error', (err) => {
        reject(err);
      });
    });
  };

  beforeAll(async () => {
    const app = createApp();
    httpServer = http.createServer(app);
    realtimeServer = RealtimeServer.getInstance();
    realtimeServer.initialize(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, () => resolve());
    });

    // 1. Authenticate Child (Leo Lion - Junior, Age 7)
    const childLogin = await (
      await fetch(`${socketUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    childToken = childLogin.data.session.token;
    childId = childLogin.data.user.id;

    // 2. Authenticate Parent (Guardian Sarah)
    const parentLogin = await (
      await fetch(`${socketUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'guardian_sarah', password: 'Password123!' }),
      })
    ).json();
    parentToken = parentLogin.data.session.token;
    parentId = parentLogin.data.user.id;

    // 3. Authenticate Admin (Safety Admin)
    const adminLogin = await (
      await fetch(`${socketUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminLogin.data.session.token;
    adminId = adminLogin.data.user.id;
  });

  afterAll(async () => {
    for (const s of activeSockets) {
      if (s.connected) s.disconnect();
    }
    await realtimeServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  // Test 1: Authenticated child can connect
  it('1. Authenticated child can connect and receives socket ID', async () => {
    const client = await connectClient(childToken);
    expect(client.connected).toBe(true);
    expect(client.id).toBeDefined();
  });

  // Test 2: Authenticated parent can connect
  it('2. Authenticated parent can connect', async () => {
    const client = await connectClient(parentToken);
    expect(client.connected).toBe(true);
  });

  // Test 3: Authenticated admin can connect
  it('3. Authenticated admin can connect', async () => {
    const client = await connectClient(adminToken);
    expect(client.connected).toBe(true);
  });

  // Test 4: Unauthenticated clients are rejected
  it('4. Unauthenticated clients are rejected by authentication handshake', async () => {
    await expect(connectClient(undefined)).rejects.toThrow(/AUTHENTICATION_REQUIRED/i);
  });

  // Test 5: Expired sessions are rejected
  it('5. Expired sessions are rejected', async () => {
    // Create an intentionally expired session
    const expiredSession = await prisma.session.create({
      data: {
        userId: childId,
        token: 'test_expired_session_token_' + Date.now(),
        expiresAt: new Date(Date.now() - 60000), // 1 min in the past
      },
    });

    await expect(connectClient(expiredSession.token)).rejects.toThrow(/INVALID_SESSION/i);
  });

  // Test 6: Logged-out users cannot continue using an authenticated connection
  it('6. Logged-out users cannot continue using an authenticated connection', async () => {
    // Register temporary user session
    const tempLogin = await (
      await fetch(`${socketUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    const mayaToken = tempLogin.data.session.token;

    const mayaClient = await connectClient(mayaToken);
    expect(mayaClient.connected).toBe(true);

    // Logout Maya via REST API
    await fetch(`${socketUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mayaToken}` },
    });

    // Send packet to trigger server-side middleware validation
    const disconnectPromise = new Promise<void>((resolve) => {
      mayaClient.on('disconnect', () => resolve());
    });

    mayaClient.emit('ping_session_check');

    await expect(disconnectPromise).resolves.toBeUndefined();
    expect(mayaClient.connected).toBe(false);
  });

  // Test 7: Child cannot join admin rooms & admin receives admin broadcasts
  it('7. Child cannot join admin rooms and only admins receive admin broadcasts', async () => {
    const childSocket = await connectClient(childToken);
    const adminSocket = await connectClient(adminToken);

    let childReceivedAdminEvent = false;
    let adminReceivedAdminEvent = false;

    childSocket.on(RealtimeEvent.MODERATION_QUEUE_UPDATED, () => {
      childReceivedAdminEvent = true;
    });

    adminSocket.on(RealtimeEvent.MODERATION_QUEUE_UPDATED, () => {
      adminReceivedAdminEvent = true;
    });

    // Emit event targeted to admin room
    realtimeServer.emitToAdmins(RealtimeEvent.MODERATION_QUEUE_UPDATED, {
      action: 'ITEM_ADDED',
      contentId: 'test-content-id',
    });

    // Wait 250ms for delivery
    await new Promise((r) => setTimeout(r, 250));

    expect(adminReceivedAdminEvent).toBe(true);
    expect(childReceivedAdminEvent).toBe(false);
  });

  // Test 8: User cannot join another user's private room
  it("8. User cannot join another user's private room; personal messages are strictly isolated", async () => {
    const childSocket = await connectClient(childToken);
    const parentSocket = await connectClient(parentToken);

    let parentReceivedChildNotification = false;
    let childReceivedChildNotification = false;

    parentSocket.on(RealtimeEvent.NOTIFICATION_CREATED, () => {
      parentReceivedChildNotification = true;
    });

    childSocket.on(RealtimeEvent.NOTIFICATION_CREATED, () => {
      childReceivedChildNotification = true;
    });

    // Emit event strictly to child's personal room
    realtimeServer.emitToUser(childId, RealtimeEvent.NOTIFICATION_CREATED, {
      id: 'notif-123',
      userId: childId,
      type: 'CONTENT_APPROVED',
      title: 'Post Approved',
      message: 'Your artwork is safe!',
      createdAt: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 250));

    expect(childReceivedChildNotification).toBe(true);
    expect(parentReceivedChildNotification).toBe(false);
  });

  // Test 9: Multiple browser sessions can connect simultaneously
  it('9. Multiple browser sessions can connect simultaneously for the same user', async () => {
    const session1 = await connectClient(childToken);
    const session2 = await connectClient(childToken);

    expect(session1.connected).toBe(true);
    expect(session2.connected).toBe(true);
    expect(session1.id).not.toBe(session2.id);

    let session1GotEvent = false;
    let session2GotEvent = false;

    session1.on(RealtimeEvent.NOTIFICATION_CREATED, () => {
      session1GotEvent = true;
    });
    session2.on(RealtimeEvent.NOTIFICATION_CREATED, () => {
      session2GotEvent = true;
    });

    realtimeServer.emitToUser(childId, RealtimeEvent.NOTIFICATION_CREATED, {
      id: 'multi-session-notif',
      userId: childId,
      type: 'SYSTEM_ALERT',
      title: 'Hello on all devices',
      message: 'Synchronized real-time update',
      createdAt: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 250));

    expect(session1GotEvent).toBe(true);
    expect(session2GotEvent).toBe(true);
  });

  // Test 10: Reconnection works after temporary network interruption
  it('10. Reconnection works cleanly when socket is temporarily disconnected and restored', async () => {
    const client = await connectClient(childToken, { reconnection: true, reconnectionDelay: 50 });
    expect(client.connected).toBe(true);

    const reconnectedPromise = new Promise<void>((resolve) => {
      client.on('connect', () => {
        resolve();
      });
    });

    // Simulate transport disconnect to trigger client auto-reconnect
    (client.io as any).engine.close();

    await reconnectedPromise;
    expect(client.connected).toBe(true);
    client.disconnect();
  }, 10000);
});
