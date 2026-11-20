import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error.js';
import { authenticate, requireAuth, requireRole, requireParentOfChild } from './middleware/auth.js';
import { UserRole } from './generated/prisma-client/index.js';

// Import domain modules
import { authRouter } from './modules/auth/index.js';
import { usersRouter } from './modules/users/index.js';
import { parentsRouter } from './modules/parents/index.js';
import { mediaRouter } from './modules/media/index.js';
import { contentsRouter } from './modules/contents/index.js';
import { postsRouter } from './modules/posts/index.js';
import { reelsRouter } from './modules/reels/index.js';
import { feedRouter } from './modules/feed/index.js';
import { commentsRouter } from './modules/comments/index.js';
import { reactionsRouter } from './modules/reactions/index.js';
import { friendshipsRouter } from './modules/friendships/index.js';
import { moderationRouter } from './modules/moderation/index.js';
import { reportsRouter } from './modules/reports/index.js';
import { notificationsRouter } from './modules/notifications/index.js';
import { adminRouter } from './modules/admin/index.js';
import { realtimeRouter } from './modules/realtime/index.js';

export function createApp() {
  const app = express();

  // Security Headers
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  // CORS Configuration
  app.use(
    cors({
      origin: [config.clientOrigin, 'http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Request Logging
  if (config.env !== 'test') {
    app.use(morgan('dev'));
  }

  // Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(config.sessionSecret));

  // Global Session Authentication Middleware
  app.use(authenticate);

  // Health check endpoint
  app.get(`${config.apiPrefix}/health`, (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        environment: config.env,
      },
      error: null,
    });
  });

  // Mount Domain Modules
  app.use(`${config.apiPrefix}/auth`, authRouter);
  app.use(`${config.apiPrefix}/users`, usersRouter);
  app.use(`${config.apiPrefix}/parents`, parentsRouter);
  app.use(`${config.apiPrefix}/parent`, parentsRouter);
  app.use(`${config.apiPrefix}/media`, mediaRouter);
  app.use(`${config.apiPrefix}/contents`, contentsRouter);
  app.use(`${config.apiPrefix}/posts`, postsRouter);
  app.use(`${config.apiPrefix}/reels`, reelsRouter);
  app.use(`${config.apiPrefix}/feed`, feedRouter);
  app.use(`${config.apiPrefix}/comments`, commentsRouter);
  app.use(`${config.apiPrefix}/reactions`, reactionsRouter);
  app.use(`${config.apiPrefix}/friendships`, friendshipsRouter);
  app.use(`${config.apiPrefix}/friends`, friendshipsRouter);
  app.use(`${config.apiPrefix}/moderation`, moderationRouter);
  app.use(`${config.apiPrefix}/reports`, reportsRouter);
  app.use(`${config.apiPrefix}/notifications`, notificationsRouter);
  app.use(`${config.apiPrefix}/admin`, adminRouter);
  app.use(`${config.apiPrefix}/realtime`, realtimeRouter);

  // Role Gate Verification Tests/Demos
  app.get(`${config.apiPrefix}/test/admin-only`, requireAuth, requireRole(UserRole.ADMIN), (req, res) => {
    res.json({ success: true, message: `Welcome Admin ${req.user!.username}` });
  });

  app.get(`${config.apiPrefix}/test/parent-only`, requireAuth, requireRole(UserRole.PARENT), (req, res) => {
    res.json({ success: true, message: `Welcome Parent ${req.user!.username}` });
  });

  app.get(`${config.apiPrefix}/test/child-only`, requireAuth, requireRole(UserRole.CHILD), (req, res) => {
    res.json({ success: true, message: `Welcome Child ${req.user!.username} (${req.user!.ageGroup})` });
  });

  app.get(`${config.apiPrefix}/test/parent/child/:childId`, requireAuth, requireParentOfChild, (req, res) => {
    res.json({ success: true, message: `Authorized parent access for child ${req.params.childId}` });
  });

  // 404 handler for undefined API routes
  app.use(`${config.apiPrefix}/*`, (req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.originalUrl} not found`,
      },
    });
  });

  // Central Error Handler
  app.use(errorHandler);

  return app;
}
