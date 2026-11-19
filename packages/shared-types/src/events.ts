export enum RealtimeEvent {
  // Content Lifecycle
  CONTENT_SUBMITTED = 'content:submitted',
  CONTENT_APPROVED = 'content:approved',
  CONTENT_REJECTED = 'content:rejected',
  CONTENT_CHANGES_REQUESTED = 'content:changes_requested',
  CONTENT_PUBLISHED = 'content:published',
  FEED_UPDATED = 'feed:updated',

  // Social & Notifications
  NOTIFICATION_CREATED = 'notification:created',
  FRIEND_REQUEST_RECEIVED = 'friend_request:received',
  FRIEND_REQUEST_ACCEPTED = 'friend_request:accepted',
  COMMENT_SUBMITTED = 'comment:submitted',

  // Parental Safety & Moderation
  PARENT_CONTROL_UPDATED = 'parent_control:updated',
  REPORT_CREATED = 'report:created',
  MODERATION_QUEUE_UPDATED = 'moderation_queue:updated',
}

export interface RealtimeEventPayloads {
  [RealtimeEvent.CONTENT_SUBMITTED]: {
    contentId: string;
    type: string;
    authorId: string;
    authorUsername: string;
    submittedAt: string;
  };
  [RealtimeEvent.CONTENT_APPROVED]: {
    contentId: string;
    type: string;
    title: string;
    approvedAudiences: string[];
  };
  [RealtimeEvent.CONTENT_REJECTED]: {
    contentId: string;
    type: string;
    reason: string;
  };
  [RealtimeEvent.CONTENT_CHANGES_REQUESTED]: {
    contentId: string;
    type: string;
    reason: string;
  };
  [RealtimeEvent.CONTENT_PUBLISHED]: {
    contentId: string;
    type: string;
    title: string;
    approvedAudiences: string[];
  };
  [RealtimeEvent.FEED_UPDATED]: {
    type: string;
    targetAgeGroups: string[];
    action: 'NEW_CONTENT' | 'CONTENT_REMOVED';
  };
  [RealtimeEvent.NOTIFICATION_CREATED]: {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    createdAt: string;
  };
  [RealtimeEvent.FRIEND_REQUEST_RECEIVED]: {
    requestId: string;
    senderId: string;
    senderUsername: string;
    receiverId: string;
  };
  [RealtimeEvent.FRIEND_REQUEST_ACCEPTED]: {
    friendshipId: string;
    friendId: string;
    friendUsername: string;
  };
  [RealtimeEvent.COMMENT_SUBMITTED]: {
    commentId: string;
    contentId: string;
    authorId: string;
    status: string;
  };
  [RealtimeEvent.PARENT_CONTROL_UPDATED]: {
    childId: string;
    settings: {
      isPaused?: boolean;
      canComment?: boolean;
      canAddFriends?: boolean;
      canWatchShortsReels?: boolean;
      dailyLimitMinutes?: number;
    };
  };
  [RealtimeEvent.REPORT_CREATED]: {
    reportId: string;
    contentId: string;
    reporterId: string;
    reason: string;
  };
  [RealtimeEvent.MODERATION_QUEUE_UPDATED]: {
    action: 'ITEM_ADDED' | 'ITEM_REVIEWED' | 'ITEM_RESOLVED';
    contentId?: string;
    queueLength?: number;
  };
}
