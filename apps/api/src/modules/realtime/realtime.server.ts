import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { parseCookie } from 'cookie';
import cookieParser from 'cookie-parser';
import { SessionService, AuthenticatedUser } from '../auth/session.service.js';
import { config } from '../../config/index.js';
import { prisma } from '../../prisma.js';
import { UserRole, AgeGroup } from '../../generated/prisma-client/index.js';
import { RealtimeEvent, RealtimeEventPayloads } from '@fizzy/shared-types';

export interface AuthenticatedSocket extends Socket {
  user: AuthenticatedUser;
  sessionId: string;
}

export class RealtimeServer {
  private static instance: RealtimeServer | null = null;
  private io: SocketIOServer | null = null;

  private constructor() {}

  public static getInstance(): RealtimeServer {
    if (!RealtimeServer.instance) {
      RealtimeServer.instance = new RealtimeServer();
    }
    return RealtimeServer.instance;
  }

  /**
   * Initializes the Socket.IO server attached to the HTTP server.
   */
  public initialize(httpServer: HttpServer): SocketIOServer {
    const allowedOrigins = [
      config.clientOrigin,
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean);

    this.io = new SocketIOServer(httpServer, {
      path: '/socket.io',
      cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      pingTimeout: 20000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
    });

    // Authentication Middleware
    this.io.use(async (socket, next) => {
      try {
        let sessionToken: string | undefined;

        // 1. Try auth handshake payload
        if (socket.handshake.auth && socket.handshake.auth.token) {
          sessionToken = socket.handshake.auth.token;
        }

        // 2. Try Authorization header
        if (!sessionToken && socket.handshake.headers.authorization) {
          const parts = socket.handshake.headers.authorization.split(' ');
          if (parts.length === 2 && parts[0] === 'Bearer') {
            sessionToken = parts[1];
          }
        }

        // 3. Try HTTP Cookie header
        if (!sessionToken && socket.handshake.headers.cookie) {
          const parsedCookies = parseCookie(socket.handshake.headers.cookie);
          const rawCookie = parsedCookies[config.sessionCookieName];
          if (rawCookie) {
            // Unsign if signed cookie
            const unsigned = cookieParser.signedCookie(rawCookie, config.sessionSecret);
            sessionToken = unsigned || rawCookie;
          }
        }

        if (!sessionToken) {
          return next(new Error('AUTHENTICATION_REQUIRED: Missing session token'));
        }

        const sessionData = await SessionService.validateSession(sessionToken);
        if (!sessionData) {
          return next(new Error('INVALID_SESSION: Session invalid, expired, or account deactivated'));
        }

        (socket as AuthenticatedSocket).user = sessionData.user;
        (socket as AuthenticatedSocket).sessionId = sessionData.session.id;

        next();
      } catch (err: any) {
        next(new Error(`AUTHENTICATION_ERROR: ${err.message}`));
      }
    });

    // Connection handler
    this.io.on('connection', async (socket) => {
      const authSocket = socket as AuthenticatedSocket;
      const user = authSocket.user;

      console.log(`[Realtime] Connected: user=${user.username} (${user.role}) socketId=${socket.id}`);

      // Setup secure rooms based strictly on verified database record
      await this.assignSecureRooms(authSocket);

      // Heartbeat & session verification on incoming events
      socket.use(async (_packet, next) => {
        try {
          const activeSession = await prisma.session.findUnique({
            where: { id: authSocket.sessionId },
            include: { user: true },
          });

          if (!activeSession || new Date() > activeSession.expiresAt || !activeSession.user.isActive) {
            socket.disconnect(true);
            return next(new Error('SESSION_EXPIRED: Connection terminated'));
          }

          next();
        } catch (err: any) {
          next(err);
        }
      });

      socket.on('disconnect', (reason) => {
        console.log(`[Realtime] Disconnected: user=${user.username} socketId=${socket.id} reason=${reason}`);
      });
    });

    return this.io;
  }

  /**
   * Secure Room Architecture
   * Strictly server-determined room membership:
   * 1. Individual User Room: user:<userId>
   * 2. Administrator Room: role:admin (Only for UserRole.ADMIN)
   * 3. Age-Group Room: age:<ageGroup> (e.g. age:JUNIOR, age:EXPLORER, age:TEEN)
   * 4. Parent-Child Relationship Rooms: parent_child:<parentId>:<childId>
   */
  private async assignSecureRooms(socket: AuthenticatedSocket): Promise<void> {
    const user = socket.user;

    // 1. Personal Room
    socket.join(`user:${user.id}`);

    // 2. Admin Room (Strict role check)
    if (user.role === UserRole.ADMIN) {
      socket.join('role:admin');
      console.log(`[Realtime] Socket ${socket.id} joined role:admin`);
    }

    // 3. Age-Group Room (Child users only)
    if (user.role === UserRole.CHILD && user.ageGroup) {
      const ageRoom = `age:${user.ageGroup}`;
      socket.join(ageRoom);
      console.log(`[Realtime] Socket ${socket.id} joined ${ageRoom}`);
    }

    // 4. Parent-Child Relationship Rooms
    if (user.role === UserRole.PARENT && user.parentProfile) {
      // Find all confirmed linked children
      const links = await prisma.parentChildLink.findMany({
        where: { parentId: user.parentProfile.id, status: 'CONFIRMED' },
        include: { child: { include: { user: true } } },
      });

      for (const link of links) {
        const familyRoom = `family:${user.id}:${link.child.userId}`;
        socket.join(familyRoom);
      }
    } else if (user.role === UserRole.CHILD && user.childProfile) {
      // Find all confirmed linked parents
      const links = await prisma.parentChildLink.findMany({
        where: { childId: user.childProfile.id, status: 'CONFIRMED' },
        include: { parent: { include: { user: true } } },
      });

      for (const link of links) {
        const familyRoom = `family:${link.parent.userId}:${user.id}`;
        socket.join(familyRoom);
      }
    }
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Emit event to an individual user's secure room.
   */
  public emitToUser<E extends RealtimeEvent>(
    userId: string,
    event: E,
    payload: RealtimeEventPayloads[E]
  ): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Emit event to administrators room.
   */
  public emitToAdmins<E extends RealtimeEvent>(
    event: E,
    payload: RealtimeEventPayloads[E]
  ): void {
    if (!this.io) return;
    this.io.to('role:admin').emit(event, payload);
  }

  /**
   * Emit event to specific age group room(s).
   */
  public emitToAgeGroups<E extends RealtimeEvent>(
    ageGroups: AgeGroup[],
    event: E,
    payload: RealtimeEventPayloads[E]
  ): void {
    if (!this.io) return;
    for (const ageGroup of ageGroups) {
      this.io.to(`age:${ageGroup}`).emit(event, payload);
    }
  }

  /**
   * Emit event to verified family / parent-child room.
   */
  public emitToFamily<E extends RealtimeEvent>(
    parentId: string,
    childId: string,
    event: E,
    payload: RealtimeEventPayloads[E]
  ): void {
    if (!this.io) return;
    this.io.to(`family:${parentId}:${childId}`).emit(event, payload);
  }

  /**
   * Graceful Shutdown
   */
  public async close(): Promise<void> {
    if (this.io) {
      console.log('[Realtime] Closing Socket.IO server...');
      this.io.disconnectSockets(true);
      await new Promise<void>((resolve) => {
        this.io!.close(() => {
          console.log('[Realtime] Socket.IO server closed.');
          resolve();
        });
      });
      this.io = null;
    }
  }
}
