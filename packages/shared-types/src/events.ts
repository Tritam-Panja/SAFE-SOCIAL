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
  FRIEND_REQUEST_REJECTED = 'friend_request:rejected',
  FRIEND_REQUEST_CANCELLED = 'friend_request:cancelled',
  FRIENDSHIP_REMOVED = 'friendship:removed',
  REACTION_UPDATED = 'reaction:updated',
  COMMENT_SUBMITTED = 'comment:submitted',
  COMMENT_APPROVED = 'comment:approved',

  // Parental Safety & Moderation
  PARENT_CONTROL_UPDATED = 'parent_control:updated',
  REPORT_CREATED = 'report:created',
  MODERATION_QUEUE_UPDATED = 'moderation_queue:updated',
  ADMIN_METRICS_UPDATED = 'admin:metrics_updated',
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
  [RealtimeEvent.FRIEND_REQUEST_REJECTED]: {
    requestId: string;
    senderId: string;
    receiverId: string;
  };
  [RealtimeEvent.FRIEND_REQUEST_CANCELLED]: {
    requestId: string;
    senderId: string;
    receiverId: string;
  };
  [RealtimeEvent.FRIENDSHIP_REMOVED]: {
    friendshipId: string;
    removedBy: string;
    targetUserId: string;
  };
  [RealtimeEvent.REACTION_UPDATED]: {
    contentId: string;
    totalReactions: number;
    emoji?: string;
  };
  [RealtimeEvent.COMMENT_SUBMITTED]: {
    commentId: string;
    contentId: string;
    authorId: string;
    status: string;
  };
  [RealtimeEvent.COMMENT_APPROVED]: {
    commentId: string;
    contentId: string;
    text: string;
    author: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      ageGroup: string | null;
    };
    createdAt: string;
  };
  [RealtimeEvent.PARENT_CONTROL_UPDATED]: {
    childId: string;
    settings: {
      isPaused?: boolean;
      pauseReason?: string | null;
      canComment?: boolean;
      canAddFriends?: boolean;
      canReceiveFriendRequests?: boolean;
      requireParentApprovalForFriends?: boolean;
      canCreateContent?: boolean;
      canWatchShortsReels?: boolean;
      dailyLimitMinutes?: number;
      bedtimeStartHour?: number | null;
      bedtimeEndHour?: number | null;
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
  [RealtimeEvent.ADMIN_METRICS_UPDATED]: {
    trigger: string;
    metrics?: {
      totalUsers?: number;
      childUsers?: number;
      parentUsers?: number;
      pendingSubmissions?: number;
      approvedContent?: number;
      rejectedContent?: number;
      reportedContent?: number;
    };
  };
}
