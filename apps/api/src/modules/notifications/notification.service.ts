import { prisma } from '../../prisma.js';
import { NotificationType, Notification } from '../../generated/prisma-client/index.js';
import { RealtimeServer, OutboxService } from '../realtime/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceId?: string | null;
}

export class NotificationService {
  /**
   * Persists a notification to PostgreSQL and delivers it via real-time Socket.IO and Outbox.
   * Runs in an optional transaction client if provided.
   */
  public static async createNotification(
    params: CreateNotificationParams,
    tx?: any
  ): Promise<Notification> {
    const db = tx || prisma;

    // 1. Database persistence in PostgreSQL
    const notification = await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        referenceId: params.referenceId || null,
        isRead: false,
      },
    });

    const payload = {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      referenceId: notification.referenceId,
      createdAt: notification.createdAt.toISOString(),
    };

    // 2. Enqueue into transactional outbox for durable delivery
    await OutboxService.enqueue(db, {
      eventType: RealtimeEvent.NOTIFICATION_CREATED,
      channelType: 'USER',
      target: `user:${notification.userId}`,
      payload,
    });

    // 3. If running outside of an explicit caller transaction, dispatch immediately
    if (!tx) {
      RealtimeServer.getInstance().emitToUser(
        notification.userId,
        RealtimeEvent.NOTIFICATION_CREATED,
        payload
      );
    }

    return notification;
  }
}
