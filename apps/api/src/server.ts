import { createApp } from './app.js';
import { config } from './config/index.js';
import { bootstrapAdmin } from './config/bootstrap.js';
import { SessionService } from './modules/auth/session.service.js';
import { prisma } from './prisma.js';

const app = createApp();

// Bootstrap admin account & initiate scheduled cleanup
bootstrapAdmin().catch(console.error);

// Clean expired sessions periodically (every 1 hour)
const sessionCleanupInterval = setInterval(() => {
  SessionService.cleanupExpiredSessions().catch(() => {});
}, 1000 * 60 * 60);

const server = app.listen(config.port, () => {
  console.log(`[Fizzy API] Server running on http://localhost:${config.port}${config.apiPrefix}`);
  console.log(`[Fizzy API] Health check at http://localhost:${config.port}${config.apiPrefix}/health`);
});

// Graceful Shutdown Handler
function handleGracefulShutdown(signal: string) {
  console.log(`\n[Fizzy API] Received ${signal}. Starting graceful shutdown...`);
  clearInterval(sessionCleanupInterval);

  server.close(async () => {
    console.log('[Fizzy API] HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('[Fizzy API] Database connections disconnected.');
      process.exit(0);
    } catch (err) {
      console.error('[Fizzy API] Error during disconnect:', err);
      process.exit(1);
    }
  });

  // Force close after 10s timeout
  setTimeout(() => {
    console.error('[Fizzy API] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

