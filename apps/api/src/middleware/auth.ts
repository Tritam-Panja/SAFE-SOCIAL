import { Request, Response, NextFunction } from 'express';
import { SessionService, AuthenticatedUser } from '../modules/auth/session.service.js';
import { config } from '../config/index.js';
import { UserRole } from '../generated/prisma-client/index.js';
import { prisma } from '../prisma.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionToken?: string;
    }
  }
}

/**
 * Extracts session token from signed/unsigned HttpOnly cookie OR Authorization Bearer header.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.[config.sessionCookieName] || req.signedCookies?.[config.sessionCookieName];

    // Mobile / programmatic client fallback: Authorization: Bearer <token>
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      next();
      return;
    }

    const result = await SessionService.validateSession(token);
    if (result) {
      req.user = result.user;
      req.sessionToken = token;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: Requires that a valid active session exists.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication is required to access this resource.',
      },
    });
    return;
  }

  // Check if child account is paused or locked by parent
  if (req.user.role === UserRole.CHILD && req.user.childProfile) {
    prisma.parentControl
      .findUnique({
        where: { childProfileId: req.user.childProfile.id },
      })
      .then((controls) => {
        if (controls && (controls.isPaused || controls.isLocked)) {
          res.status(403).json({
            success: false,
            data: null,
            error: {
              code: 'ACCOUNT_PAUSED_BY_PARENT',
              message: controls.pauseReason || 'Your account is currently paused by your parent or guardian.',
            },
          });
          return;
        }
        next();
      })
      .catch(next);
    return;
  }

  next();
}

/**
 * Middleware: Requires one or more specified roles.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.',
        },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: ${roles.join(', ')}.`,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Verifies that a parent has confirmed permission to access the specified child's data.
 * Checks params.childId or params.id.
 */
export async function requireParentOfChild(req: Request, res: Response, next: NextFunction): Promise<void> {
  const childId = req.params.childId || req.params.id;

  if (!req.user || req.user.role !== UserRole.PARENT) {
    res.status(403).json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Parent role is required.' },
    });
    return;
  }

  const parentProfileId = req.user.parentProfile?.id;
  if (!parentProfileId || !childId) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'INVALID_REQUEST', message: 'Child ID is required.' },
    });
    return;
  }

  // Look up link
  const link = await prisma.parentChildLink.findFirst({
    where: {
      parentId: parentProfileId,
      child: {
        OR: [{ id: childId }, { userId: childId }],
      },
      status: 'CONFIRMED',
    },
  });

  if (!link) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN_GUARDIAN_LINK',
        message: 'You are not the verified parent or guardian of this child.',
      },
    });
    return;
  }

  next();
}

/**
 * Middleware: Ensures the authenticated user owns the resource or is an administrator.
 */
export function requireOwnershipOrAdmin(getOwnerId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
      return;
    }

    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    const ownerId = getOwnerId(req);
    if (ownerId && req.user.id !== ownerId) {
      res.status(403).json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN_OWNERSHIP', message: 'You do not have permission to modify this resource.' },
      });
      return;
    }

    next();
  };
}
