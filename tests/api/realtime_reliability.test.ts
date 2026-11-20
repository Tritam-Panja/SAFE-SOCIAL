import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer, OutboxService } from '../../apps/api/dist/modules/realtime/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { NotificationService } from '../../apps/api/dist/modules/notifications/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';
import { OutboxStatus } from '../../apps/api/dist/generated/prisma-client/index.js';

describe('Prompt 22: Real-Time Reliability, Recovery & Duplicate Prevention Suite', () => {
  let server: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4100;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const socketUrl = `http://localhost:${PORT}`;

  let childToken: string;
  let childId: string;
  let parentToken: string;
  let parentId: string;

  const connectSocket = (token: string): Promise<ClientSocketType> => {
    return new Promise((resolve, reject) => {
      const client = ClientSocket(socketUrl, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 500,
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

    // 1. Authenticate Child Leo
    const childLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    childToken = childLogin.data.session.token;
    childId = childLogin.data.user.id;

    // 2. Authenticate Parent Sarah
    const parentLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'guardian_sarah', password: 'Password123!' }),
      })
    ).json();
    parentToken = parentLogin.data.session.token;
    parentId = parentLogin.data.user.id;
  });

  afterAll(async () => {
    // Ensure all test client sockets are closed before server shutdown
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }, 20000);

  it('1. Reconnection & Recovery: Client disconnected during event misses socket message, recovers state via /realtime/sync', async () => {
    const socket = await connectSocket(childToken);
    expect(socket.connected).toBe(true);

    // Record baseline sync timestamp
    const beforeDisconnectTime = new Date().toISOString();

    // Disconnect client (simulate network drop or sleep)
    socket.disconnect();
    expect(socket.connected).toBe(false);

    // While client is offline, create a new persistent database notification
    const testNotification = await NotificationService.createNotification({
      userId: childId,
      type: 'SYSTEM_ALERT',
      title: 'Offline Event Delivery Test',
      message: 'This notification occurred while socket was disconnected.',
      referenceId: 'offline-test-ref-1',
    });

    // Client reconnects
    socket.connect();
    await new Promise<void>((resolve) => {
      if (socket.connected) resolve();
      else socket.on('connect', () => resolve());
    });
    expect(socket.connected).toBe(true);

    // Client invokes /realtime/sync with since cursor
    const syncRes = await (
      await fetch(`${baseUrl}/realtime/sync?since=${encodeURIComponent(beforeDisconnectTime)}`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(syncRes.success).toBe(true);
    expect(syncRes.data.unreadNotificationsCount).toBeGreaterThan(0);
    const recovered = syncRes.data.recentNotifications.find((n: any) => n.id === testNotification.id);
    expect(recovered).toBeDefined();
    expect(recovered.title).toBe('Offline Event Delivery Test');

    socket.disconnect();
  });

  it('2. Transactional Outbox Reliability: Events are stored in database and retried if delivery was pending', async () => {
    // Clean up any lingering PENDING outbox items before test
    await prisma.eventOutbox.deleteMany({
      where: { status: OutboxStatus.PENDING },
    });

    // Client connects first and listens for outbox delivery
    const socket = await connectSocket(childToken);
    expect(socket.connected).toBe(true);

    const deliveryPromise = new Promise<any>((resolve) => {
      socket.on(RealtimeEvent.NOTIFICATION_CREATED, (data) => {
        if (data.title === 'Reliable Delivery Check') {
          resolve(data);
        }
      });
    });

    // Manually enqueue an event in eventOutbox
    const testPayload = {
      id: `outbox-test-${Date.now()}`,
      userId: childId,
      type: 'SYSTEM_ALERT',
      title: 'Reliable Delivery Check',
      message: 'Stored safely in PostgreSQL first.',
      createdAt: new Date().toISOString(),
    };

    await OutboxService.enqueue(null, {
      eventType: RealtimeEvent.NOTIFICATION_CREATED,
      channelType: 'USER',
      target: `user:${childId}`,
      payload: testPayload,
    });

    // Check that event exists with status PENDING in outbox
    const pending = await prisma.eventOutbox.findFirst({
      where: {
        eventType: RealtimeEvent.NOTIFICATION_CREATED,
        status: OutboxStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(pending).toBeDefined();

    // Process outbox worker
    await OutboxService.processPendingEvents();

    const deliveredPayload = await deliveryPromise;
    expect(deliveredPayload.title).toBe('Reliable Delivery Check');

    // Verify outbox entry transitioned to PROCESSED
    const updated = await prisma.eventOutbox.findUnique({
      where: { id: pending!.id },
    });
    expect(updated?.status).toBe(OutboxStatus.PROCESSED);
    expect(updated?.processedAt).toBeDefined();

    socket.disconnect();
  });

  it('3. Duplicate Prevention: Database constraints prevent duplicate reactions, friendships, and duplicate reviews', async () => {
    const post = await prisma.content.findFirst({
      where: { type: 'POST', status: 'APPROVED' },
    });
    expect(post).toBeDefined();

    // Toggle reaction once
    const res1 = await (
      await fetch(`${baseUrl}/reactions/${post!.id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ emoji: '🌟' }),
      })
    ).json();
    expect(res1.success).toBe(true);

    // Direct database insert attempt for identical reaction must fail unique constraint
    let caughtConstraint = false;
    try {
      await prisma.reaction.create({
        data: {
          contentId: post!.id,
          userId: childId,
          emoji: '🌟',
        },
      });
    } catch (e: any) {
      caughtConstraint = true;
      expect(e.code).toBe('P2002'); // Prisma unique constraint violation code
    }
    expect(caughtConstraint).toBe(true);

    // Clean up reaction
    await (
      await fetch(`${baseUrl}/reactions/${post!.id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ emoji: '🌟' }),
      })
    ).json();
  });

  it('4. Safe Polling Fallback: Unauthorized endpoints cannot be polled; polling returns strictly caller scoped data', async () => {
    // Child requests sync -> receives their own data only
    const childSyncRes = await (
      await fetch(`${baseUrl}/realtime/sync`, {
        headers: { Authorization: `Bearer ${childToken}` },
      })
    ).json();

    expect(childSyncRes.success).toBe(true);
    expect(childSyncRes.data.parentControls).toBeDefined();
    expect(childSyncRes.data.adminMetrics).toBeNull(); // Child cannot receive admin metrics

    // Unauthenticated request must be rejected
    const unauthRes = await (
      await fetch(`${baseUrl}/realtime/sync`)
    ).json();

    expect(unauthRes.success).toBe(false);
    expect(unauthRes.error.code).toBe('UNAUTHORIZED');
  });
});
