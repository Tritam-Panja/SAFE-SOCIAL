import { UserRole, AgeGroup, ContentStatus, ContentType, FriendshipStatus } from './enums.js';

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  ageGroup?: AgeGroup | null;
  avatarUrl?: string | null;
  childProfile?: {
    id: string;
    parentLinkCode: string;
  } | null;
  parentProfile?: {
    id: string;
    phoneNumber?: string | null;
  } | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface PostItem {
  id: string;
  authorId: string;
  author: UserSummary;
  caption: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  status: ContentStatus;
  approvedAudiences: AgeGroup[];
  createdAt: string;
}

export interface ReelItem {
  id: string;
  authorId: string;
  author: UserSummary;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  requestedAudiences: AgeGroup[];
  approvedAudiences: AgeGroup[];
  status: ContentStatus;
  createdAt: string;
}
