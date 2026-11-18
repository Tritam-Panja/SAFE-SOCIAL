import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Private Media & Quarantine Ingestion Pipeline', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4030;
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  let childToken: string;
  let adminToken: string;

  // Minimal 1x1 valid PNG image buffer
  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // Login as child (Maya Explorer)
    const childLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
    });
    childToken = (await childLogin.json()).data.session.token;

    // Login as Admin
    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
    });
    adminToken = (await adminLogin.json()).data.session.token;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Step 1: Child requests upload URL and receives safe quarantine key', async () => {
    const res = await fetch(`${baseUrl}/media/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${childToken}`,
      },
      body: JSON.stringify({
        fileName: 'my_drawing.png',
        mimeType: 'image/png',
        fileSizeBytes: 1024,
        mediaType: 'IMAGE',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.uploadUrl).toBeDefined();
    expect(body.data.storageKey).toContain('quarantine/');
    expect(body.data.storageKey).toContain('image_');
  });

  it('Step 1: Rejects oversized uploads exceeding safety limit', async () => {
    const res = await fetch(`${baseUrl}/media/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${childToken}`,
      },
      body: JSON.stringify({
        fileName: 'giant_file.png',
        mimeType: 'image/png',
        fileSizeBytes: 20 * 1024 * 1024, // 20MB exceeds 10MB limit
        mediaType: 'IMAGE',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('Step 2 & 3: Uploads file to local quarantine and completes inspection', async () => {
    // 1. Get upload ticket
    const ticketRes = await fetch(`${baseUrl}/media/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${childToken}`,
      },
      body: JSON.stringify({
        fileName: 'nature_photo.png',
        mimeType: 'image/png',
        fileSizeBytes: samplePngBuffer.length,
        mediaType: 'IMAGE',
      }),
    });
    const { uploadUrl, storageKey } = (await ticketRes.json()).data;

    // 2. Put file to quarantine endpoint
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: samplePngBuffer,
    });
    expect(uploadRes.status).toBe(200);

    // 3. Complete and verify binary magic bytes
    const completeRes = await fetch(`${baseUrl}/media/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${childToken}`,
      },
      body: JSON.stringify({
        storageKey,
        mediaType: 'IMAGE',
        fileSizeBytes: samplePngBuffer.length,
      }),
    });

    const completeBody = await completeRes.json();
    expect(completeRes.status).toBe(201);
    expect(completeBody.success).toBe(true);
    expect(completeBody.data.isQuarantined).toBe(true);
    expect(completeBody.data.mimeType).toBe('image/png');

    const mediaAssetId = completeBody.data.mediaAssetId;

    // 4. Retrieve media: Child owner CAN preview
    const childFetch = await fetch(`${baseUrl}/media/${mediaAssetId}`, {
      headers: { Authorization: `Bearer ${childToken}` },
    });
    expect(childFetch.status).toBe(200);
    const childFetchBody = await childFetch.json();
    expect(childFetchBody.data.isQuarantined).toBe(true);

    // 5. Admin CAN preview quarantined media
    const adminFetch = await fetch(`${baseUrl}/media/${mediaAssetId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminFetch.status).toBe(200);
  });

  it('Rejects fake file with mismatched signature/magic bytes', async () => {
    // 1. Request image ticket
    const ticketRes = await fetch(`${baseUrl}/media/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${childToken}`,
      },
      body: JSON.stringify({
        fileName: 'malicious.png',
        mimeType: 'image/png',
        fileSizeBytes: 64,
        mediaType: 'IMAGE',
      }),
    });
    const { uploadUrl, storageKey } = (await ticketRes.json()).data;

    // 2. Upload plain text disguised as PNG
    const fakeBuffer = Buffer.from('NOT_A_PNG_FILE_JUST_CORRUPTED_TEXT_DATA');
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: fakeBuffer,
    });

    // 3. Complete verification should fail magic byte check
    const completeRes = await fetch(`${baseUrl}/media/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${childToken}`,
      },
      body: JSON.stringify({
        storageKey,
        mediaType: 'IMAGE',
        fileSizeBytes: fakeBuffer.length,
      }),
    });

    const completeBody = await completeRes.json();
    expect(completeRes.status).toBe(400);
    expect(completeBody.success).toBe(false);
    expect(completeBody.error.code).toBe('INVALID_FILE_SIGNATURE');
  });
});
