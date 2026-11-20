import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer } from '../../apps/api/dist/modules/realtime/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { RealtimeEvent } from '@fizzy/shared-types';
import { ReviewDecision, AgeGroup, ContentStatus } from '../../apps/api/dist/generated/prisma-client/index.js';

describe('Prompt 21: Real-Time Admin Operations Suite', () => {
  let server: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4099;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const socketUrl = `http://localhost:${PORT}`;

  let adminToken: string;
  let adminId: string;
  let adminSocket: ClientSocketType;

  let childToken: string;
  let childId: string;
  let childSocket: ClientSocketType;

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

    // 1. Authenticate Admin
    const adminLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminLogin.data.session.token;
    adminId = adminLogin.data.user.id;

    // 2. Authenticate Child Leo (JUNIOR)
    const childLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    childToken = childLogin.data.session.token;
    childId = childLogin.data.user.id;

    // Ensure child controls allow content creation
    await prisma.parentControl.updateMany({
      where: { childProfile: { userId: childId } },
      data: { isPaused: false, canCreateContent: true, canComment: true },
    });

    // Connect authenticated WebSockets
    adminSocket = await connectSocket(adminToken);
    childSocket = await connectSocket(childToken);
  });

  afterAll(async () => {
    if (adminSocket) adminSocket.disconnect();
    if (childSocket) childSocket.disconnect();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1. Live Moderation Queue: Child submits bio update -> Admin socket receives live alert; child does not', async () => {
    // Admin listens for moderation queue and content submission
    const queuePromise = new Promise<any>((resolve) => {
      adminSocket.once(RealtimeEvent.MODERATION_QUEUE_UPDATED, (data) => resolve(data));
    });

    // Child socket listener to verify strict security isolation
    let childGotAdminAlert = false;
    childSocket.once(RealtimeEvent.MODERATION_QUEUE_UPDATED, () => {
      childGotAdminAlert = true;
    });

    // Child Leo submits a bio update
    const bioRes = await (
      await fetch(`${baseUrl}/users/bio`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({ bio: 'I love painting and reading science books!' }),
      })
    ).json();

    expect(bioRes.success).toBe(true);

    // Verify admin socket received live update
    const queuePayload = await queuePromise;
    expect(queuePayload.action).toBe('ITEM_ADDED');

    // Child must not receive admin-room broadcast
    expect(childGotAdminAlert).toBe(false);

    // Verify item is in moderation queue API
    const queueList = await (
      await fetch(`${baseUrl}/moderation/queue`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();

    expect(queueList.success).toBe(true);
    const bioItem = queueList.data.find((item: any) => item.type === 'PROFILE_BIO' && item.author.id === childId);
    expect(bioItem).toBeDefined();
    expect(bioItem.caption).toBe('I love painting and reading science books!');
  });

  it('2. Live Dashboard Metrics: New user registration broadcasts real-time database-backed metric updates', async () => {
    const metricsPromise = new Promise<any>((resolve) => {
      adminSocket.on(RealtimeEvent.ADMIN_METRICS_UPDATED, (data) => {
        if (data.trigger === 'USER_REGISTERED') {
          resolve(data);
        }
      });
    });

    const uniqueSuffix = Date.now();
    const regRes = await (
      await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `user_test_${uniqueSuffix}`,
          displayName: `User ${uniqueSuffix}`,
          email: `test_${uniqueSuffix}@example.com`,
          password: 'Password123!',
          role: 'PARENT',
        }),
      })
    ).json();

    expect(regRes.success).toBe(true);

    const metricsPayload = await metricsPromise;
    expect(metricsPayload.trigger).toBe('USER_REGISTERED');
    expect(metricsPayload.metrics).toBeDefined();
    expect(metricsPayload.metrics.totalUsers).toBeGreaterThan(0);
  });

  it('3. Live Reports: User submits report -> Admin receives report:created & updated metrics', async () => {
    // Find an approved post to report
    const post = await prisma.content.findFirst({
      where: { type: 'POST', status: ContentStatus.APPROVED },
    });
    expect(post).toBeDefined();

    const reportPromise = new Promise<any>((resolve) => {
      adminSocket.once(RealtimeEvent.REPORT_CREATED, (data) => resolve(data));
    });
    const metricsPromise = new Promise<any>((resolve) => {
      adminSocket.on(RealtimeEvent.ADMIN_METRICS_UPDATED, (data) => {
        if (data.trigger === 'REPORT_CREATED') {
          resolve(data);
        }
      });
    });

    const reportRes = await (
      await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${childToken}`,
        },
        body: JSON.stringify({
          contentId: post!.id,
          reason: 'Suspicious link in caption',
          details: 'Please double check this image caption.',
        }),
      })
    ).json();

    expect(reportRes.success).toBe(true);
    const reportId = reportRes.data.reportId;

    const reportPayload = await reportPromise;
    expect(reportPayload.reportId).toBe(reportId);
    expect(reportPayload.contentId).toBe(post!.id);

    const metricsPayload = await metricsPromise;
    expect(metricsPayload.trigger).toBe('REPORT_CREATED');
  });

  it('4. Safe Moderation Decisions: Atomic state transition, audit logging, and metrics broadcast', async () => {
    // Find the pending bio update from test 1
    const pendingBio = await prisma.content.findFirst({
      where: {
        type: 'PROFILE_BIO',
        authorId: childId,
        status: ContentStatus.PENDING_REVIEW,
      },
    });
    expect(pendingBio).toBeDefined();

    const adminQueuePromise = new Promise<any>((resolve) => {
      adminSocket.once(RealtimeEvent.MODERATION_QUEUE_UPDATED, (data) => resolve(data));
    });
    const adminMetricsPromise = new Promise<any>((resolve) => {
      adminSocket.once(RealtimeEvent.ADMIN_METRICS_UPDATED, (data) => resolve(data));
    });

    // Admin approves the bio
    const decisionRes = await (
      await fetch(`${baseUrl}/moderation/decision/${pendingBio!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          decision: ReviewDecision.APPROVE,
          reason: 'Child bio is kind, safe and positive.',
          internalNotes: 'Admin verified no PII disclosed.',
        }),
      })
    ).json();

    expect(decisionRes.success).toBe(true);

    const queuePayload = await adminQueuePromise;
    expect(queuePayload.action).toBe('ITEM_REVIEWED');
    expect(queuePayload.contentId).toBe(pendingBio!.id);

    const metricsPayload = await adminMetricsPromise;
    expect(metricsPayload.trigger).toBe('DECISION_APPROVE');

    // Verify Leo's active bio was updated
    const updatedUser = await prisma.user.findUnique({
      where: { id: childId },
    });
    expect(updatedUser?.bio).toBe('I love painting and reading science books!');
    expect(updatedUser?.pendingBio).toBeNull();

    // Verify audit log exists
    const actionLog = await prisma.moderationAction.findFirst({
      where: { contentId: pendingBio!.id, adminId },
      orderBy: { createdAt: 'desc' },
    });
    expect(actionLog).toBeDefined();
    expect(actionLog?.newStatus).toBe(ContentStatus.APPROVED);

    // Prevent duplicate decision (invalid transition from APPROVED -> REJECT)
    const duplicateRes = await (
      await fetch(`${baseUrl}/moderation/decision/${pendingBio!.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          decision: ReviewDecision.REJECT,
          reason: 'Conflicting late review',
        }),
      })
    ).json();

    expect(duplicateRes.success).toBe(false);
    expect(duplicateRes.error.code).toBe('DECISION_FAILED');
  });
});
