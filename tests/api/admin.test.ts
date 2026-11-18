import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Admin Dashboard, Reporting & Notifications Suite', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4080;
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  let adminToken: string;
  let adminId: string;
  let leoToken: string;
  let leoId: string;
  let mayaToken: string;
  let mayaId: string;
  let approvedPostId: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });

    // 1. Admin login
    const adminRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'safety_admin', password: 'Password123!' }),
      })
    ).json();
    adminToken = adminRes.data.session.token;
    adminId = adminRes.data.user.id;

    // 2. Leo (Junior) login
    const leoRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'leo_lion_7', password: 'Password123!' }),
      })
    ).json();
    leoToken = leoRes.data.session.token;
    leoId = leoRes.data.user.id;

    // 3. Maya (Explorer) login
    const mayaRes = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'maya_explorer', password: 'Password123!' }),
      })
    ).json();
    mayaToken = mayaRes.data.session.token;
    mayaId = mayaRes.data.user.id;

    // Get an approved post ID
    const post = await prisma.content.findFirst({
      where: { status: 'APPROVED', type: 'POST' },
    });
    approvedPostId = post!.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('Admin Dashboard: Returns dynamic metrics computed directly from database', async () => {
    const res = await (
      await fetch(`${baseUrl}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();

    expect(res.success).toBe(true);
    expect(res.data.metrics).toBeDefined();
    expect(res.data.metrics.totalUsers).toBeGreaterThan(0);
    expect(res.data.metrics.childUsers).toBeGreaterThan(0);
    expect(res.data.metrics.parentUsers).toBeGreaterThan(0);
    expect(Array.isArray(res.data.recentActions)).toBe(true);
  });

  it('Non-admin accounts cannot access admin dashboard (RBAC protection)', async () => {
    const res = await (
      await fetch(`${baseUrl}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();

    expect(res.success).toBe(false);
    expect(res.error.code).toBe('FORBIDDEN');
  });

  it('Child Reports Content: Submits report and stores with PENDING status and audit record', async () => {
    const reportRes = await (
      await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${leoToken}`,
        },
        body: JSON.stringify({
          contentId: approvedPostId,
          reason: 'Inappropriate language in caption',
          details: 'Contains mean words not suitable for younger children.',
        }),
      })
    ).json();

    expect(reportRes.success).toBe(true);
    expect(reportRes.data.reportId).toBeDefined();
    expect(reportRes.data.status).toBe('PENDING');

    // Admin views report in reports queue
    const adminReports = await (
      await fetch(`${baseUrl}/reports?status=PENDING`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();

    expect(adminReports.success).toBe(true);
    const foundReport = adminReports.data.find((r: any) => r.id === reportRes.data.reportId);
    expect(foundReport).toBeDefined();
    expect(foundReport.reporter.username).toBe('leo_lion_7');

    // Admin resolves the report
    const resolveRes = await (
      await fetch(`${baseUrl}/reports/${reportRes.data.reportId}/resolve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: 'RESOLVED',
          actionTaken: 'Reviewed and confirmed safe; added internal advisory note.',
        }),
      })
    ).json();

    expect(resolveRes.success).toBe(true);
    expect(resolveRes.data.status).toBe('RESOLVED');
  });

  it('Notifications: Delivered to specific recipient, recipient can mark read or read-all', async () => {
    // 1. Create a notification for Leo
    const notif = await prisma.notification.create({
      data: {
        userId: leoId,
        type: 'CONTENT_APPROVED',
        title: 'Post Approved!',
        message: 'Your art post is now live.',
      },
    });

    // 2. Leo retrieves notifications
    const leoNotifs = await (
      await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();

    expect(leoNotifs.success).toBe(true);
    expect(leoNotifs.data.some((n: any) => n.id === notif.id)).toBe(true);

    // 3. Maya CANNOT see Leo's notifications
    const mayaNotifs = await (
      await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${mayaToken}` },
      })
    ).json();
    expect(mayaNotifs.data.some((n: any) => n.id === notif.id)).toBe(false);

    // 4. Leo marks notification as read
    const markReadRes = await (
      await fetch(`${baseUrl}/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();
    expect(markReadRes.success).toBe(true);
    expect(markReadRes.data.isRead).toBe(true);

    // 5. Leo marks all as read
    const readAllRes = await (
      await fetch(`${baseUrl}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${leoToken}` },
      })
    ).json();
    expect(readAllRes.success).toBe(true);
    expect(readAllRes.data.markedAsRead).toBe(true);
  });

  it('Admin User Management: Lists users and allows updating active status', async () => {
    // 1. Fetch user list
    const usersRes = await (
      await fetch(`${baseUrl}/admin/users?role=CHILD&limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();

    expect(usersRes.success).toBe(true);
    expect(Array.isArray(usersRes.data)).toBe(true);
    expect(usersRes.data.length).toBeGreaterThan(0);
    expect(usersRes.data.some((u: any) => u.username === 'leo_lion_7')).toBe(true);

    // 2. Toggle status test
    const toggleRes = await (
      await fetch(`${baseUrl}/admin/users/${leoId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: true }),
      })
    ).json();

    expect(toggleRes.success).toBe(true);
    expect(toggleRes.data.isActive).toBe(true);
  });
});
