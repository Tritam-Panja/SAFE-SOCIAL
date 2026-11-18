import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma.js';
import { config } from '../../config/index.js';
import { User, Session, ChildProfile, ParentProfile } from '../../generated/prisma-client/index.js';

export type AuthenticatedUser = User & {
  childProfile: ChildProfile | null;
  parentProfile: ParentProfile | null;
};

export class SessionService {
  /**
   * Hashes a password using bcrypt with cost factor 10.
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Compares a plaintext password against a stored hash.
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generates a high-entropy session token and stores the session in the database.
   */
  static async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<Session> {
    // Generate 48 bytes of cryptographically strong random token
    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + config.sessionMaxAgeMs);

    return prisma.session.create({
      data: {
        userId,
        token,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
      },
    });
  }

  /**
   * Validates a session token, cleans up expired sessions, and retrieves the authenticated user.
   */
  static async validateSession(token: string): Promise<{ session: Session; user: AuthenticatedUser } | null> {
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            childProfile: true,
            parentProfile: true,
          },
        },
      },
    });

    if (!session) return null;

    // Check expiration
    if (new Date() > session.expiresAt || !session.user.isActive) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return {
      session,
      user: session.user,
    };
  }

  /**
   * Revokes a specific session.
   */
  static async revokeSession(token: string): Promise<void> {
    await prisma.session.delete({ where: { token } }).catch(() => {});
  }

  /**
   * Cleans up all expired sessions in the database.
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }
}
