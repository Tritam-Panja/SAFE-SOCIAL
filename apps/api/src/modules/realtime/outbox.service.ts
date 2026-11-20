import { prisma } from '../../prisma.js';
import { RealtimeServer } from './realtime.server.js';
import { AgeGroup, OutboxStatus } from '../../generated/prisma-client/index.js';
import { RealtimeEvent } from '@fizzy/shared-types';

export interface EnqueueOutboxOptions {
  eventType: RealtimeEvent;
  channelType: 'AGE_GROUP' | 'USER' | 'ADMIN' | 'FAMILY';
  target: string; // e.g. 'TEEN' or 'user:<id>' or 'role:admin' or 'family:<p>:<c>'
  payload: any;
}

export class OutboxService {
  private static workerInterval: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  /**
   * Enqueues an event inside an existing Prisma transaction or standalone query.
   */
  public static async enqueue(
    tx: any,
    options: EnqueueOutboxOptions
  ): Promise<void> {
    const db = tx || prisma;
    await db.eventOutbox.create({
      data: {
        eventType: options.eventType,
        channelType: options.channelType,
        target: options.target,
        payloadJson: JSON.stringify(options.payload),
        status: OutboxStatus.PENDING,
      },
    });
  }

  /**
   * Processes pending events from the transactional outbox table and delivers them via Socket.IO.
   */
  public static async processPendingEvents(limit = 50): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const pendingEvents = await prisma.eventOutbox.findMany({
        where: { status: OutboxStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      if (pendingEvents.length === 0) {
        return 0;
      }

      const realtime = RealtimeServer.getInstance();

      for (const event of pendingEvents) {
        try {
          const payload = JSON.parse(event.payloadJson);

          switch (event.channelType) {
            case 'AGE_GROUP': {
              const ageGroup = event.target as AgeGroup;
              realtime.emitToAgeGroups([ageGroup], event.eventType as RealtimeEvent, payload);
              break;
            }
            case 'USER': {
              const userId = event.target.replace(/^user:/, '');
              realtime.emitToUser(userId, event.eventType as RealtimeEvent, payload);
              break;
            }
            case 'ADMIN': {
              realtime.emitToAdmins(event.eventType as RealtimeEvent, payload);
              break;
            }
            case 'FAMILY': {
              const parts = event.target.replace(/^family:/, '').split(':');
              if (parts.length === 2) {
                realtime.emitToFamily(parts[0], parts[1], event.eventType as RealtimeEvent, payload);
              }
              break;
            }
            default:
              console.warn(`[Outbox] Unknown channel type: ${event.channelType}`);
          }

          // Mark as processed
          await prisma.eventOutbox.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.PROCESSED,
              processedAt: new Date(),
            },
          });
        } catch (deliveryError: any) {
          console.error(`[Outbox] Error delivering event ${event.id}:`, deliveryError);
          await prisma.eventOutbox.update({
            where: { id: event.id },
            data: {
              retryCount: { increment: 1 },
              errorMessage: deliveryError?.message || 'Delivery failed',
              status: event.retryCount >= 5 ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            },
          });
        }
      }

      return pendingEvents.length;
    } catch (error) {
      console.error('[Outbox] Error in processPendingEvents:', error);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Starts periodic polling worker for background event outbox delivery.
   */
  public static startWorker(intervalMs = 1000): void {
    if (this.workerInterval) return;
    this.workerInterval = setInterval(() => {
      this.processPendingEvents().catch(() => {});
    }, intervalMs);
  }

  /**
   * Stops the outbox worker.
   */
  public static stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }
}
