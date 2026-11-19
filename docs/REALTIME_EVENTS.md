# Real-Time Event Registry & Payload Schemas

## Overview
All real-time communications in Fizzy use strictly typed event identifiers defined in `@fizzy/shared-types` (`RealtimeEvent`). Events provide notification payloads while preserving REST/database authority.

---

## Event Catalog

### 1. Content & Feed Lifecycle Events

#### `content:submitted`
- **Scope**: `role:admin`
- **Trigger**: A child creates a new photo post or uploads a Short/Reel.
- **Payload**:
  ```ts
  {
    contentId: string;
    type: 'POST' | 'SHORT' | 'REEL';
    authorId: string;
    authorUsername: string;
    submittedAt: string; // ISO 8601
  }
  ```

#### `content:approved`
- **Scope**: `user:<authorId>`
- **Trigger**: Moderator approves a submitted item.
- **Payload**:
  ```ts
  {
    contentId: string;
    type: 'POST' | 'SHORT' | 'REEL';
    title: string;
    approvedAudiences: ('JUNIOR' | 'EXPLORER' | 'TEEN')[];
  }
  ```

#### `content:rejected`
- **Scope**: `user:<authorId>`
- **Trigger**: Moderator rejects submitted content.
- **Payload**:
  ```ts
  {
    contentId: string;
    type: 'POST' | 'SHORT' | 'REEL';
    reason: string;
  }
  ```

#### `content:changes_requested`
- **Scope**: `user:<authorId>`
- **Trigger**: Moderator requests content adjustments.
- **Payload**:
  ```ts
  {
    contentId: string;
    type: 'POST' | 'SHORT' | 'REEL';
    reason: string;
  }
  ```

#### `feed:updated`
- **Scope**: `age:<ageGroup>` (dispatched to each authorized age tier room)
- **Trigger**: Approved content becomes published and visible.
- **Payload**:
  ```ts
  {
    type: 'POST' | 'SHORT' | 'REEL';
    targetAgeGroups: ('JUNIOR' | 'EXPLORER' | 'TEEN')[];
    action: 'NEW_CONTENT';
  }
  ```

---

### 2. Moderation & Safety Reports

#### `moderation:queue_updated`
- **Scope**: `role:admin`
- **Trigger**: New content enters moderation or moderation decision is recorded.
- **Payload**:
  ```ts
  {
    action: 'ITEM_ADDED' | 'ITEM_REVIEWED';
    contentId: string;
  }
  ```

#### `report:created`
- **Scope**: `role:admin`
- **Trigger**: Child reports inappropriate content or user.
- **Payload**:
  ```ts
  {
    reportId: string;
    contentId?: string;
    reporterId: string;
    reason: string;
  }
  ```

---

### 3. Parent Controls & Supervision

#### `parent_control:updated`
- **Scope**: `user:<childId>` and `family:<parentId>:<childId>`
- **Trigger**: Parent toggles restrictions (account pause, friends, comments, reels).
- **Payload**:
  ```ts
  {
    childId: string;
    settings: {
      isPaused: boolean;
      canComment: boolean;
      canAddFriends: boolean;
      canWatchShortsReels: boolean;
      dailyLimitMinutes: number;
    };
  }
  ```

---

### 4. General Notifications

#### `notification:created`
- **Scope**: `user:<userId>`
- **Trigger**: System alert, moderation status, or social interaction notification.
- **Payload**:
  ```ts
  {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    createdAt: string; // ISO 8601
  }
  ```

---

## Client Integration Pattern (React)

```tsx
import React, { useEffect } from 'react';
import { useRealtime } from '../context/RealtimeContext';
import { RealtimeEvent } from '@fizzy/shared-types';

export const NotificationBadge: React.FC = () => {
  const { on, isConnected } = useRealtime();

  useEffect(() => {
    // Register listener
    const unsubscribe = on(RealtimeEvent.NOTIFICATION_CREATED, (payload) => {
      console.log('New live notification:', payload.title);
      // Trigger local state update or query refetch
    });

    // Automatically unsubscribes on unmount
    return unsubscribe;
  }, [on]);

  return <span className={isConnected ? 'status-online' : 'status-offline'} />;
};
```
