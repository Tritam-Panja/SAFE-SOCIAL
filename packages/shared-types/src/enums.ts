export enum UserRole {
  CHILD = 'CHILD',
  PARENT = 'PARENT',
  ADMIN = 'ADMIN',
}

export enum AgeGroup {
  JUNIOR = 'JUNIOR',     // Ages 6–8
  EXPLORER = 'EXPLORER', // Ages 9–12
  TEEN = 'TEEN',         // Ages 13–17
}

export enum ContentType {
  POST = 'POST',
  SHORT = 'SHORT',
  REEL = 'REEL',
  COMMENT = 'COMMENT',
  PROFILE_PHOTO = 'PROFILE_PHOTO',
  PROFILE_BIO = 'PROFILE_BIO',
}

export enum ContentStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  UNDER_REVIEW = 'UNDER_REVIEW',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
  REMOVED = 'REMOVED',
}

export enum ReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_CHANGES = 'REQUEST_CHANGES',
}

export enum FriendshipStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  BLOCKED = 'BLOCKED',
}
