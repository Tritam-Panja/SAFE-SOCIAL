import { Router, Request, Response, NextFunction } from 'express';
import { prisma, calculateAgeGroup } from '../../prisma.js';
import { SessionService } from './session.service.js';
import { validateRequest } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../../middleware/rateLimit.js';
import { registerSchema, loginSchema, RegisterInput, LoginInput } from '@fizzy/validation';
import { UserRole } from '../../generated/prisma-client/index.js';
import { config } from '../../config/index.js';

export const authRouter = Router();

/**
 * Cookie options helper
 */
function getCookieOptions() {
  const isProduction = config.env === 'production';
  return {
    httpOnly: true,
    secure: isProduction, // Set to true in prod (HTTPS)
    sameSite: isProduction ? ('strict' as const) : ('lax' as const),
    maxAge: config.sessionMaxAgeMs,
    path: '/',
  };
}

/**
 * POST /api/v1/auth/register
 * Supports CHILD and PARENT registration. Never allows public ADMIN registration.
 */
authRouter.post(
  '/register',
  registerLimiter,
  validateRequest(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as RegisterInput;

      // Check username collisions
      const existingUser = await prisma.user.findFirst({
        where: { username: input.username },
      });

      if (existingUser) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: 'USERNAME_TAKEN',
            message: 'That username is already taken. Please choose another fun name!',
          },
        });
        return;
      }

      const passwordHash = await SessionService.hashPassword(input.password);

      if (input.role === UserRole.CHILD) {
        // Compute developmental age tier dynamically
        const birthDate = new Date(input.birthDate);
        let ageGroup;
        try {
          ageGroup = calculateAgeGroup(birthDate);
        } catch (err: any) {
          res.status(400).json({
            success: false,
            data: null,
            error: { code: 'INVALID_AGE', message: err.message },
          });
          return;
        }

        const newUser = await prisma.user.create({
          data: {
            username: input.username,
            displayName: input.displayName,
            passwordHash,
            role: UserRole.CHILD,
            ageGroup,
            birthDate,
            childProfile: {
              create: {
                parentControls: {
                  create: {
                    dailyLimitMinutes: ageGroup === 'JUNIOR' ? 45 : ageGroup === 'EXPLORER' ? 60 : 90,
                    canWatchShortsReels: true,
                    canCreateContent: true,
                    canComment: ageGroup !== 'JUNIOR', // Junior tier default: emojis only
                    canAddFriends: true,
                    requireParentApprovalForFriends: ageGroup === 'JUNIOR',
                  },
                },
              },
            },
          },
          include: {
            childProfile: {
              include: { parentControls: true },
            },
          },
        });

        // Create session
        const session = await SessionService.createSession(
          newUser.id,
          req.ip,
          req.headers['user-agent']
        );

        res.cookie(config.sessionCookieName, session.token, getCookieOptions());

        res.status(201).json({
          success: true,
          data: {
            user: {
              id: newUser.id,
              username: newUser.username,
              displayName: newUser.displayName,
              role: newUser.role,
              ageGroup: newUser.ageGroup,
              childProfile: {
                parentLinkCode: newUser.childProfile?.parentLinkCode,
                parentControls: newUser.childProfile?.parentControls,
              },
            },
            session: {
              token: session.token,
              expiresAt: session.expiresAt,
            },
          },
          error: null,
        });
        return;
      } else if (input.role === UserRole.PARENT) {
        // Check email uniqueness
        const existingEmail = await prisma.user.findFirst({
          where: { email: input.email },
        });

        if (existingEmail) {
          res.status(400).json({
            success: false,
            data: null,
            error: {
              code: 'EMAIL_REGISTERED',
              message: 'An account is already registered with this email address.',
            },
          });
          return;
        }

        const newUser = await prisma.user.create({
          data: {
            username: input.username,
            displayName: input.displayName,
            email: input.email,
            passwordHash,
            role: UserRole.PARENT,
            parentProfile: {
              create: {
                phoneNumber: input.phoneNumber || null,
              },
            },
          },
          include: {
            parentProfile: true,
          },
        });

        const session = await SessionService.createSession(
          newUser.id,
          req.ip,
          req.headers['user-agent']
        );

        res.cookie(config.sessionCookieName, session.token, getCookieOptions());

        res.status(201).json({
          success: true,
          data: {
            user: {
              id: newUser.id,
              username: newUser.username,
              displayName: newUser.displayName,
              role: newUser.role,
              email: newUser.email,
              parentProfile: newUser.parentProfile,
            },
            session: {
              token: session.token,
              expiresAt: session.expiresAt,
            },
          },
          error: null,
        });
        return;
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/login
 */
authRouter.post(
  '/login',
  loginLimiter,
  validateRequest(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { usernameOrEmail, password } = req.body as LoginInput;

      // Find user by username or email
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
        },
        include: {
          childProfile: {
            include: { parentControls: true },
          },
          parentProfile: true,
        },
      });

      // Generic authentication error to prevent user enumeration
      const genericAuthError = {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username/email or password.',
      };

      if (!user || !user.isActive) {
        res.status(401).json({ success: false, data: null, error: genericAuthError });
        return;
      }

      const isValidPassword = await SessionService.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        res.status(401).json({ success: false, data: null, error: genericAuthError });
        return;
      }

      // Check if child account is currently locked by parent controls
      if (user.role === UserRole.CHILD && user.childProfile?.parentControls?.isLocked) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: 'ACCOUNT_LOCKED_BY_PARENT',
            message: 'This account is currently paused by parent controls.',
          },
        });
        return;
      }

      // Create session
      const session = await SessionService.createSession(
        user.id,
        req.ip,
        req.headers['user-agent']
      );

      res.cookie(config.sessionCookieName, session.token, getCookieOptions());

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            ageGroup: user.ageGroup,
            email: user.email,
            childProfile: user.childProfile,
            parentProfile: user.parentProfile,
          },
          session: {
            token: session.token,
            expiresAt: session.expiresAt,
          },
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/logout
 */
authRouter.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.sessionToken) {
        await SessionService.revokeSession(req.sessionToken);
      }

      res.clearCookie(config.sessionCookieName, { path: '/' });

      res.status(200).json({
        success: true,
        data: { message: 'Successfully logged out.' },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/auth/me
 * Returns current authenticated user and role context.
 */
authRouter.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        ageGroup: user.ageGroup,
        email: user.email,
        avatarUrl: user.avatarUrl,
        childProfile: user.childProfile,
        parentProfile: user.parentProfile,
      },
      error: null,
    });
  }
);
