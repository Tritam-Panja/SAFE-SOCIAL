import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { sendFriendRequestSchema, respondFriendRequestSchema, SendFriendRequestInput, RespondFriendRequestInput } from '@fizzy/validation';
import { UserRole, FriendRequestStatus } from '../../generated/prisma-client/index.js';

import { NotificationService } from '../notifications/index.js';
import { RealtimeServer } from '../realtime/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';

export const friendshipsRouter = Router();

/**
 * GET /api/v1/friends
 * Returns accepted friendships for the caller.
 */
friendshipsRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
        include: {
          userA: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, ageGroup: true },
          },
          userB: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, ageGroup: true },
          },
        },
      });

      const friends = friendships.map((f) => {
        const friendUser = f.userAId === user.id ? f.userB : f.userA;
        return {
          friendshipId: f.id,
          friend: friendUser,
          friendsSince: f.createdAt,
        };
      });

      res.status(200).json({ success: true, data: friends, error: null });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/friends/requests
 * Returns pending incoming and outgoing friend requests.
 */
friendshipsRouter.get(
  '/requests',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      const [incoming, outgoing] = await Promise.all([
        prisma.friendRequest.findMany({
          where: { receiverId: user.id, status: FriendRequestStatus.PENDING },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, ageGroup: true },
            },
          },
        }),
        prisma.friendRequest.findMany({
          where: { senderId: user.id, status: FriendRequestStatus.PENDING },
          include: {
            receiver: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, ageGroup: true },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          incoming: incoming.map((r) => ({ id: r.id, sender: r.sender, createdAt: r.createdAt })),
          outgoing: outgoing.map((r) => ({ id: r.id, receiver: r.receiver, createdAt: r.createdAt })),
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/friends/request
 * Send a friend request by target username.
 * Prevents self-directed requests, duplicates, blocked users, and respects parent controls.
 */
friendshipsRouter.post(
  '/request',
  requireAuth,
  requireRole(UserRole.CHILD),
  validateRequest(sendFriendRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const { targetUsername } = req.body as SendFriendRequestInput;

      // 1. Prevent self-directed requests
      if (user.username.toLowerCase() === targetUsername.toLowerCase()) {
        res.status(400).json({
          success: false,
          data: null,
          error: { code: 'SELF_FRIEND_REQUEST', message: 'You cannot send a friend request to yourself!' },
        });
        return;
      }

      // 2. Target user lookup
      const targetUser = await prisma.user.findUnique({
        where: { username: targetUsername },
        include: { childProfile: { include: { parentControls: true } } },
      });

      if (!targetUser || targetUser.role !== UserRole.CHILD) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'USER_NOT_FOUND', message: 'No child account found with that username.' },
        });
        return;
      }

      // 3. Check caller parent controls (can caller add friends?)
      if (user.childProfile) {
        const callerControls = await prisma.parentControl.findUnique({
          where: { childProfileId: user.childProfile.id },
        });

        if (callerControls && !callerControls.canAddFriends) {
          res.status(403).json({
            success: false,
            data: null,
            error: {
              code: 'FRIENDS_DISABLED_BY_PARENT',
              message: 'Your parent has turned off adding new friends.',
            },
          });
          return;
        }
      }

      // 3b. Check target child parent controls (can target receive friend requests?)
      if (targetUser.childProfile?.parentControls) {
        const targetControls = targetUser.childProfile.parentControls;
        if (!targetControls.canReceiveFriendRequests) {
          res.status(403).json({
            success: false,
            data: null,
            error: {
              code: 'TARGET_RECEIVE_FRIENDS_DISABLED',
              message: 'This user is currently not accepting new friend requests.',
            },
          });
          return;
        }
      }

      // 4. Check if blocked
      const isBlocked = await prisma.blockedUser.findFirst({
        where: {
          OR: [
            { blockerId: user.id, blockedId: targetUser.id },
            { blockerId: targetUser.id, blockedId: user.id },
          ],
        },
      });

      if (isBlocked) {
        res.status(403).json({
          success: false,
          data: null,
          error: { code: 'BLOCKED_USER', message: 'Cannot connect with this user.' },
        });
        return;
      }

      // 5. Check if already friends
      const [uA, uB] = [user.id, targetUser.id].sort();
      const existingFriendship = await prisma.friendship.findUnique({
        where: { userAId_userBId: { userAId: uA, userBId: uB } },
      });

      if (existingFriendship) {
        res.status(400).json({
          success: false,
          data: null,
          error: { code: 'ALREADY_FRIENDS', message: 'You are already friends with this user!' },
        });
        return;
      }

      // 6. Check existing pending request
      const existingReq = await prisma.friendRequest.findFirst({
        where: {
          OR: [
            { senderId: user.id, receiverId: targetUser.id },
            { senderId: targetUser.id, receiverId: user.id },
          ],
          status: FriendRequestStatus.PENDING,
        },
      });

      if (existingReq) {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: 'REQUEST_PENDING',
            message: 'A friend request is already pending between you and this user.',
          },
        });
        return;
      }

      // 7. Create FriendRequest
      const friendRequest = await prisma.friendRequest.create({
        data: {
          senderId: user.id,
          receiverId: targetUser.id,
          status: FriendRequestStatus.PENDING,
        },
      });

      // Notification & Real-time Delivery
      await NotificationService.createNotification({
        userId: targetUser.id,
        type: 'FRIEND_REQUEST',
        title: 'New Friend Request! 🤝',
        message: `${user.displayName} (@${user.username}) wants to be friends on Fizzy!`,
        referenceId: friendRequest.id,
      });

      RealtimeServer.getInstance().emitToUser(targetUser.id, RealtimeEvent.FRIEND_REQUEST_RECEIVED, {
        requestId: friendRequest.id,
        senderId: user.id,
        senderUsername: user.username,
        receiverId: targetUser.id,
      });

      res.status(201).json({
        success: true,
        data: {
          requestId: friendRequest.id,
          message: `Friend request sent to @${targetUser.username}!`,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/friends/respond/:requestId
 * Accept or decline incoming friend request.
 */
friendshipsRouter.post(
  '/respond/:requestId',
  requireAuth,
  validateRequest(respondFriendRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const requestId = req.params.requestId;
      const { action } = req.body as RespondFriendRequestInput;

      const friendReq = await prisma.friendRequest.findUnique({
        where: { id: requestId },
      });

      if (!friendReq || friendReq.receiverId !== user.id || friendReq.status !== FriendRequestStatus.PENDING) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'INVALID_REQUEST', message: 'Friend request not found or not actionable.' },
        });
        return;
      }

      if (action === 'ACCEPT') {
        const [uA, uB] = [friendReq.senderId, friendReq.receiverId].sort();

        await prisma.$transaction(async (tx) => {
          await tx.friendRequest.update({
            where: { id: requestId },
            data: { status: FriendRequestStatus.ACCEPTED },
          });

          await tx.friendship.create({
            data: { userAId: uA, userBId: uB },
          });

          await NotificationService.createNotification(
            {
              userId: friendReq.senderId,
              type: 'FRIEND_ACCEPTED',
              title: 'Friend Request Accepted! 🎉',
              message: `${user.displayName} accepted your friend request!`,
              referenceId: requestId,
            },
            tx
          );

          RealtimeServer.getInstance().emitToUser(friendReq.senderId, RealtimeEvent.FRIEND_REQUEST_ACCEPTED, {
            friendshipId: `${uA}_${uB}`,
            friendId: user.id,
            friendUsername: user.username,
          });
        });

        res.status(200).json({ success: true, message: 'Friend request accepted!' });
      } else {
        await prisma.friendRequest.update({
          where: { id: requestId },
          data: { status: FriendRequestStatus.DECLINED },
        });

        RealtimeServer.getInstance().emitToUser(friendReq.senderId, RealtimeEvent.FRIEND_REQUEST_REJECTED, {
          requestId: friendReq.id,
          senderId: friendReq.senderId,
          receiverId: friendReq.receiverId,
        });

        res.status(200).json({ success: true, message: 'Friend request declined.' });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/friends/request/:requestId
 * Cancel outgoing friend request.
 */
friendshipsRouter.delete(
  '/request/:requestId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const friendReq = await prisma.friendRequest.findUnique({
        where: { id: req.params.requestId },
      });

      if (!friendReq || friendReq.senderId !== user.id) {
        res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Request not found' } });
        return;
      }

      await prisma.friendRequest.delete({ where: { id: friendReq.id } });

      RealtimeServer.getInstance().emitToUser(friendReq.receiverId, RealtimeEvent.FRIEND_REQUEST_CANCELLED, {
        requestId: friendReq.id,
        senderId: friendReq.senderId,
        receiverId: friendReq.receiverId,
      });

      res.status(200).json({ success: true, message: 'Friend request cancelled.' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/friends/:friendshipId
 * Remove friendship edge.
 */
friendshipsRouter.delete(
  '/:friendshipId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const friendship = await prisma.friendship.findUnique({
        where: { id: req.params.friendshipId },
      });

      if (!friendship || (friendship.userAId !== user.id && friendship.userBId !== user.id && user.role !== UserRole.ADMIN)) {
        res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Friendship not found.' } });
        return;
      }

      await prisma.friendship.delete({ where: { id: friendship.id } });

      const otherUserId = friendship.userAId === user.id ? friendship.userBId : friendship.userAId;
      RealtimeServer.getInstance().emitToUser(otherUserId, RealtimeEvent.FRIENDSHIP_REMOVED, {
        friendshipId: friendship.id,
        removedBy: user.id,
        targetUserId: otherUserId,
      });

      res.status(200).json({ success: true, message: 'Friend friendship removed.' });
    } catch (error) {
      next(error);
    }
  }
);
