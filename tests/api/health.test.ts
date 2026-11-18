import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../apps/api/src/app.js';

describe('API Health Check and Base Infrastructure', () => {
  const app = createApp();
  let server: http.Server;
  const PORT = 4010;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/v1/health should respond with healthy status', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.version).toBe('0.1.0');
    expect(body.error).toBeNull();
  });

  it('GET /api/v1/nonexistent should return standard 404 response envelope', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/v1/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('Modular routes should respond on their domain prefixes', async () => {
    const parentRes = await fetch(`http://localhost:${PORT}/api/v1/parents/status`);
    expect(parentRes.status).toBe(200);
    const parentBody = await parentRes.json();
    expect(parentBody.message).toBe('Parents module ready');
  });
});
