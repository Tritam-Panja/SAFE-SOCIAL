import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/dist/app.js';
import { prisma } from '../../apps/api/dist/prisma.js';

describe('Auth & Role-Based Access Control Integration Suite', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4020;
  const baseUrl = `http://localhost:${PORT}/api/v1`;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Child registration enforces age limits and computes age group', async () => {
    const uniqueUsername = `kid_test_${Date.now()}`;
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'CHILD',
        username: uniqueUsername,
        displayName: 'Test Kid',
        password: 'Password123!',
        birthDate: '2016-05-15', // ~10 yrs old in 2026 -> EXPLORER
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('CHILD');
    expect(body.data.user.ageGroup).toBe('EXPLORER');
    expect(body.data.session.token).toBeDefined();

    // Verify Set-Cookie header contains HttpOnly session
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('fizzy_session=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('Rejects registration for child under 6 years of age', async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'CHILD',
        username: `too_young_${Date.now()}`,
        displayName: 'Baby Kid',
        password: 'Password123!',
        birthDate: '2023-01-01', // 3 yrs old in 2026
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_AGE');
  });

  it('Parent registration creates parent profile', async () => {
    const uniqueParent = `parent_test_${Date.now()}`;
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'PARENT',
        username: uniqueParent,
        displayName: 'Test Parent',
        email: `${uniqueParent}@fizzy.test`,
        password: 'Password123!',
        phoneNumber: '+1-555-9988',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('PARENT');
    expect(body.data.user.parentProfile).toBeDefined();
  });

  it('Prevents public registration with ADMIN role', async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'ADMIN',
        username: 'hacker_admin',
        displayName: 'Fake Admin',
        password: 'Password123!',
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('Authenticates demo accounts and returns cookie + me', async () => {
    // Login as seeded explorer child
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'maya_explorer',
        password: 'Password123!',
      }),
    });

    const loginBody = await loginRes.json();
    expect(loginRes.status).toBe(200);
    expect(loginBody.success).toBe(true);
    expect(loginBody.data.user.username).toBe('maya_explorer');

    const token = loginBody.data.session.token;

    // Use Bearer header to check /auth/me
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meBody = await meRes.json();
    expect(meRes.status).toBe(200);
    expect(meBody.data.username).toBe('maya_explorer');
    expect(meBody.data.role).toBe('CHILD');
  });

  it('Enforces RBAC role gates correctly', async () => {
    // 1. Login as Child
    const childLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'maya_explorer',
        password: 'Password123!',
      }),
    });
    const childToken = (await childLogin.json()).data.session.token;

    // Child accessing child endpoint -> 200
    const childOnChild = await fetch(`${baseUrl}/test/child-only`, {
      headers: { Authorization: `Bearer ${childToken}` },
    });
    expect(childOnChild.status).toBe(200);

    // Child accessing admin endpoint -> 403 Forbidden
    const childOnAdmin = await fetch(`${baseUrl}/test/admin-only`, {
      headers: { Authorization: `Bearer ${childToken}` },
    });
    expect(childOnAdmin.status).toBe(403);

    // Child accessing parent endpoint -> 403 Forbidden
    const childOnParent = await fetch(`${baseUrl}/test/parent-only`, {
      headers: { Authorization: `Bearer ${childToken}` },
    });
    expect(childOnParent.status).toBe(403);

    // 2. Login as Admin
    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'safety_admin',
        password: 'Password123!',
      }),
    });
    const adminToken = (await adminLogin.json()).data.session.token;

    // Admin accessing admin endpoint -> 200 OK
    const adminOnAdmin = await fetch(`${baseUrl}/test/admin-only`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminOnAdmin.status).toBe(200);
  });

  it('Revokes session on logout', async () => {
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'jordan_teen_skater',
        password: 'Password123!',
      }),
    });
    const token = (await loginRes.json()).data.session.token;

    // Logout
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(200);

    // Attempting /auth/me with revoked token should fail with 401
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(401);
  });
});
