import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../apps/api/dist/app.js';
import { RealtimeServer, OutboxService } from '../../apps/api/dist/modules/realtime/index.js';
import { prisma } from '../../apps/api/dist/prisma.js';
import { RealtimeEvent } from '@fizzy/shared-types';

describe('Prompt 17: Real-Time Feed & Age-Restricted Content Delivery Suite', () => {
  let server: http.Server;
  let realtimeServer: RealtimeServer;
  const PORT = 4096;
  process.env.TEST_PORT = String(PORT);
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const socketUrl = `http://localhost:${PORT}`;

  // Child tokens & IDs for the three age tiers
  let juniorToken: string;
  let juniorId: string;
  let juniorSocket: ClientSocketType;

  let explorerToken: string;
  let explorerId: string;
  let explorerSocket: ClientSocketType;

  let teenToken: string;
  let teenId: string;
  let teenSocket: ClientSocketType;

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

    // 1. Authenticate JUNIOR child (Leo, age 7)
    const juniorLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    juniorToken = juniorLogin.data.session.token;
    juniorId = juniorLogin.data.user.id;

    // 2. Authenticate EXPLORER child (Maya, age 10)
    const explorerLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    explorerToken = explorerLogin.data.session.token;
    explorerId = explorerLogin.data.user.id;

    // 3. Authenticate TEEN child (Jordan, age 15)
    const teenLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'jordan_teen_skater', password: 'Password123!' }),
      })
    ).json();
    teenToken = teenLogin.data.session.token;
    teenId = teenLogin.data.user.id;

    // 4. Authenticate ADMIN
    const adminLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminLogin.data.session.token;
    adminId = adminLogin.data.user.id;

    // Connect all three sockets
    juniorSocket = await connectSocket(juniorToken);
    explorerSocket = await connectSocket(explorerToken);
    teenSocket = await connectSocket(teenToken);
  });

  afterAll(async () => {
    juniorSocket?.disconnect();
    explorerSocket?.disconnect();
    teenSocket?.disconnect();

    await realtimeServer.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  // =========================================================================
  // SCENARIO 1: TEEN child submits a Reel requesting JUNIOR + EXPLORER + TEEN
  // Admin reviews and approves TEEN only.
  // =========================================================================
  it('1. Admin approves Reel for TEEN only: Only TEEN socket receives event, JUNIOR and EXPLORER do not', async () => {
    // A. Teen uploads reel video to local storage
    const uploadRes = await (
      await fetch(`${baseUrl}/media/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'teen_skate_tricks.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 2048,
          mediaType: 'VIDEO',
        }),
      })
    ).json();
    expect(uploadRes.success).toBe(true);
    const { uploadUrl, storageKey } = uploadRes.data;

    const mp4Bytes = Buffer.from(
      'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQ==',
      'base64'
    );
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: mp4Bytes,
    });

    const compRes = await (
      await fetch(`${baseUrl}/media/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storageKey,
          mediaType: 'VIDEO',
          fileSizeBytes: mp4Bytes.length,
          durationSeconds: 25,
        }),
      })
    ).json();
    expect(compRes.success).toBe(true);
    const mediaAssetId = compRes.data.mediaAssetId;

    // B. Teen creates Reel requesting all 3 tiers: JUNIOR, EXPLORER, TEEN
    const reelRes = await (
      await fetch(`${baseUrl}/reels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Advanced Skateboard Tricks',
          caption: 'Stair jump tutorial for teens',
          videoAssetId: mediaAssetId,
          durationSeconds: 25,
          type: 'REEL',
          requestedAudiences: ['JUNIOR', 'EXPLORER', 'TEEN'],
        }),
      })
    ).json();
    expect(reelRes.success).toBe(true);
    const reelId = reelRes.data.id;

    // C. Set up event listeners on all 3 client sockets
    let juniorReceived = false;
    let explorerReceived = false;
    let teenReceived = false;
    let receivedPayload: any = null;

    juniorSocket.on(RealtimeEvent.FEED_UPDATED, () => {
      juniorReceived = true;
    });
    explorerSocket.on(RealtimeEvent.FEED_UPDATED, () => {
      explorerReceived = true;
    });
    teenSocket.on(RealtimeEvent.FEED_UPDATED, (payload) => {
      teenReceived = true;
      receivedPayload = payload;
    });

    // D. Admin approves TEEN ONLY
    const decisionRes = await (
      await fetch(`${baseUrl}/moderation/decision/${reelId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'APPROVE',
          approvedAudiences: ['TEEN'],
          reason: 'Approved for teenagers only; stunts not suitable for younger ages.',
        }),
      })
    ).json();
    expect(decisionRes.success).toBe(true);

    // Give time for outbox delivery via Socket.IO
    await new Promise((r) => setTimeout(r, 400));

    // E. Verify Real-time Delivery Invariant
    expect(teenReceived).toBe(true);
    expect(juniorReceived).toBe(false);
    expect(explorerReceived).toBe(false);

    expect(receivedPayload).toBeDefined();
    expect(receivedPayload.type).toBe('REEL');
    expect(receivedPayload.targetAgeGroups).toEqual(['TEEN']);
    // Verify no private or unauthorized media URLs were leaked in socket payload
    expect(receivedPayload.mediaAssets).toBeUndefined();
    expect(receivedPayload.videoUrl).toBeUndefined();

    // =========================================================================
    // SCENARIO 2: Direct REST content retrieval authorization
    // =========================================================================
    // 1. Teen can retrieve through direct REST request
    const directTeenRes = await (
      await fetch(`${baseUrl}/contents/${reelId}`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(directTeenRes.success).toBe(true);
    expect(directTeenRes.data.id).toBe(reelId);
    expect(directTeenRes.data.approvedAudiences).toContain('TEEN');

    // 2. Junior CANNOT retrieve through direct REST request
    const directJuniorRes = await (
      await fetch(`${baseUrl}/contents/${reelId}`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(directJuniorRes.success).toBe(false);
    expect(directJuniorRes.error.code).toBe('CONTENT_UNAVAILABLE');

    // 3. Explorer CANNOT retrieve through direct REST request
    const directExplorerRes = await (
      await fetch(`${baseUrl}/contents/${reelId}`, {
        headers: { Authorization: `Bearer ${explorerToken}` },
      })
    ).json();
    expect(directExplorerRes.success).toBe(false);
    expect(directExplorerRes.error.code).toBe('CONTENT_UNAVAILABLE');

    // =========================================================================
    // SCENARIO 3: Feeds retrieved via REST query
    // =========================================================================
    // 1. Teen reels feed includes the reel
    const teenFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(teenFeed.success).toBe(true);
    const teenHasReel = teenFeed.data.some((r: any) => r.id === reelId);
    expect(teenHasReel).toBe(true);

    // 2. Junior reels feed MUST NOT include the reel
    const juniorFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(juniorFeed.success).toBe(true);
    const juniorHasReel = juniorFeed.data.some((r: any) => r.id === reelId);
    expect(juniorHasReel).toBe(false);

    // 3. Explorer reels feed MUST NOT include the reel
    const explorerFeed = await (
      await fetch(`${baseUrl}/reels/feed`, {
        headers: { Authorization: `Bearer ${explorerToken}` },
      })
    ).json();
    expect(explorerFeed.success).toBe(true);
    const explorerHasReel = explorerFeed.data.some((r: any) => r.id === reelId);
    expect(explorerHasReel).toBe(false);

    // Clean up listeners
    juniorSocket.off(RealtimeEvent.FEED_UPDATED);
    explorerSocket.off(RealtimeEvent.FEED_UPDATED);
    teenSocket.off(RealtimeEvent.FEED_UPDATED);
  });

  // =========================================================================
  // SCENARIO 4: Newly connected users retrieve the correct feed through the API
  // =========================================================================
  it('4. Newly connected users retrieve the correct database-filtered feed through the API', async () => {
    // Simulate a fresh login and feed load
    const freshTeenRes = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${teenToken}` },
      })
    ).json();
    expect(freshTeenRes.success).toBe(true);
    expect(Array.isArray(freshTeenRes.data)).toBe(true);

    const freshJuniorRes = await (
      await fetch(`${baseUrl}/feed`, {
        headers: { Authorization: `Bearer ${juniorToken}` },
      })
    ).json();
    expect(freshJuniorRes.success).toBe(true);
    expect(Array.isArray(freshJuniorRes.data)).toBe(true);

    // Check that every item in junior's feed is explicitly approved for JUNIOR
    for (const item of freshJuniorRes.data) {
      if (item.approvedAudiences) {
        expect(item.approvedAudiences).toContain('JUNIOR');
      }
    }
  });

  // =========================================================================
  // SCENARIO 5: Transactional Outbox resilience & duplicate suppression
  // =========================================================================
  it('5. Duplicate events do not create duplicates; outbox processes reliably', async () => {
    // Verify outbox entries were recorded in database
    const outboxEntries = await prisma.eventOutbox.findMany({
      where: {
        eventType: RealtimeEvent.FEED_UPDATED,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    expect(outboxEntries.length).toBeGreaterThan(0);
    // Verified status changed to PROCESSED
    expect(outboxEntries[0].status).toBe('PROCESSED');
    expect(outboxEntries[0].processedAt).toBeDefined();

    // Trigger outbox processing again to verify idempotency (no pending duplicate replay)
    const reprocessedCount = await OutboxService.processPendingEvents();
    expect(reprocessedCount).toBe(0);
  });
});
