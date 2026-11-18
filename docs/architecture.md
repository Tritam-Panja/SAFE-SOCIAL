# Architecture Specification — Child-Safe Social Media Web Platform

## 1. Executive Summary & Vision

The platform is an Instagram-inspired, safety-first social media ecosystem designed strictly for young audiences aged 6–17, segmented into three distinct developmental age tiers:
- **JUNIOR** (6–8 years): Highly restricted, guided visual interface, simplified interactions, tightly ring-fenced community.
- **EXPLORER** (9–12 years): Richer exploration features, curated short videos, pre-moderated comments, guided discovery.
- **TEEN** (13–17 years): Full-featured modern social experience (Stories/Reels/Feeds/Direct Sharing) with robust automated alerts, parental oversight, and strict moderation safeguards.

The platform's foundational differentiator is **Mandatory Zero-Trust Pre-Moderation**: No user-generated content (posts, reels, shorts, avatars, bios, public comments) becomes visible to other users until an authorized administrator verifies, moderates, and approves it.

---

## 2. System Architecture & Topology

The system is architected as a **modular monolith** with a decoupled React single-page application (SPA) and an Express/Node.js API service sharing TypeScript definitions and Zod validation schemas. The architecture is engineered mobile-first so that the same REST/JSON + Cookie/Bearer-capable backend can seamlessly power native iOS and Android clients (via Capacitor, React Native, or native Swift/Kotlin) in future phases.

```
                      +---------------------------------------+
                      |       Clients & Web Frontends         |
                      |  - Web Client (React + Vite + shadcn) |
                      |  - Mobile App Ready (Capacitor/Native)|
                      +-------------------+-------------------+
                                          |
                                          | HTTPS / REST + SSE / WS
                                          v
                      +---------------------------------------+
                      |         Node.js API Monolith          |
                      |          (Express + TypeScript)       |
                      |                                       |
                      |  +---------------------------------+  |
                      |  |     Middleware & Security       |  |
                      |  |  - Helmet / Rate Limiter / CORS |  |
                      |  |  - Session / HttpOnly Cookies   |  |
                      |  |  - Role & Age RBAC Guards       |  |
                      |  +-----------------+---------------+  |
                      |                    |                  |
                      |  +-----------------v---------------+  |
                      |  |         Domain Modules          |  |
                      |  |  - Auth & Guardian Linking      |  |
                      |  |  - User Profile & Age Governance|  |
                      |  |  - Post & Reel Ingestion        |  |
                      |  |  - Moderation Queue Engine      |  |
                      |  |  - Safety Controls & Reports    |  |
                      |  |  - Feed & Interaction Service   |  |
                      |  +-----------------+---------------+  |
                      +--------------------+------------------+
                                           |
                 +-------------------------+-------------------------+
                 |                                                   |
                 v                                                   v
+---------------------------------+                 +---------------------------------+
|      PostgreSQL Database        |                 |      Private Object Storage     |
|   (Relational Data, Prisma ORM, |                 |   (Cloudflare R2 / S3-Compat    |
|   Auditing, Sessions, Mod Queue)|                 |   Signed Pre-Signed Upload URLs)|
+---------------------------------+                 +---------------------------------+
```

---

## 3. Monorepo Organization & Directory Layout

A pnpm or npm workspaces structure isolating domain responsibilities:

```
fizzy/
├── apps/
│   ├── web/                          # React 18+ SPA (Vite, TypeScript, Tailwind, shadcn/ui)
│   │   ├── src/
│   │   │   ├── assets/               # Public and theme assets
│   │   │   ├── components/           # UI components (shared, primitives, shadcn)
│   │   │   │   ├── ui/               # shadcn/ui atomic components
│   │   │   │   ├── junior/           # Junior-specific simplified components
│   │   │   │   ├── explorer/         # Explorer-tier components
│   │   │   │   ├── teen/             # Teen-tier rich components
│   │   │   │   ├── moderation/       # Admin moderation cards and queue tools
│   │   │   │   └── guardian/         # Parent safety controls dashboard
│   │   │   ├── context/              # Auth, theme, age-mode, notification contexts
│   │   │   ├── hooks/                # Custom React hooks (TanStack Query wrappers)
│   │   │   ├── layouts/              # AppLayout, AuthLayout, AdminLayout, ParentLayout
│   │   │   ├── pages/                # Route targets (Feed, Reels, Profile, Admin, Settings)
│   │   │   ├── routes/               # React Router v6 definitions & protected route guards
│   │   │   ├── services/             # Axios/fetch API clients
│   │   │   └── types/                # Frontend local UI state types
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── api/                          # Node.js + Express backend modular monolith
│       ├── src/
│       │   ├── config/               # Environment variables, constants, cloud configs
│       │   ├── middleware/           # Auth, role check, age gate, rate limiter, error handling
│       │   ├── modules/              # Domain modules
│       │   │   ├── auth/             # Login, registration, parent consent, session management
│       │   │   ├── users/            # Profiles, child accounts, parent linking, avatars
│       │   │   ├── posts/            # Photo post CRUD, draft management
│       │   │   ├── reels/            # Video reel ingestion, chunk metadata, duration limits
│       │   │   ├── moderation/       # Review queue, audit logging, approve/reject workflow
│       │   │   ├── safety/           # Parent controls, screen-time caps, keyword blocklists
│       │   │   ├── interactions/     # Pre-moderated comments, likes, friendship graph
│       │   │   ├── notifications/    # System alerts, moderation approvals/rejections
│       │   │   └── storage/          # Cloudflare R2 presigned URL signer & media validator
│       │   ├── server.ts             # HTTP server entrypoint
│       │   └── app.ts                # Express application configuration
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── shared-types/                 # Shared TypeScript models, enums & interfaces
│   │   ├── src/
│   │   │   ├── enums.ts              # Role, AgeGroup, ModerationStatus, ContentType, MediaType
│   │   │   ├── models.ts             # User, Post, Reel, Comment, Report, AuditEntry types
│   │   │   ├── api.ts                # Standard API response & error envelopes
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── validation/                   # Shared runtime validation (Zod schemas)
│       ├── src/
│       │   ├── auth.schema.ts        # Child/Parent register, login, password schemas
│       │   ├── post.schema.ts        # Post creation & upload schemas
│       │   ├── reel.schema.ts        # Reel creation, audience selection schemas
│       │   ├── moderation.schema.ts  # Approve/Reject decision payloads
│       │   ├── safety.schema.ts      # Parent restriction toggle schemas
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── prisma/
│   ├── schema.prisma                 # Declarative data model & indexes
│   ├── migrations/                   # Sequential SQL migrations
│   └── seed.ts                       # Database seeder (mock kids, parents, admins, queues)
│
├── tests/
│   ├── unit/                         # Pure business logic unit tests (Vitest)
│   ├── integration/                  # API integration tests with mock DB (Supertest)
│   └── e2e/                          # End-to-end browser tests (Playwright)
│
├── docs/                             # Architectural and engineering specifications
│   ├── architecture.md
│   ├── development-plan.md
│   └── business-rules.md
│
├── .gitignore
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 4. Database Architecture & Data Models (Prisma)

The database runs on PostgreSQL. The relational schema ensures strict referential integrity, immutable audit logs, and clear separation between creator-requested preferences and administrator-approved production settings.

### Key Enumerations

- `Role`: `CHILD`, `PARENT`, `ADMIN`
- `AgeGroup`: `JUNIOR` (6–8), `EXPLORER` (9–12), `TEEN` (13–17)
- `ModerationStatus`: `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `FLAGGED_ESCALATED`
- `ContentType`: `PHOTO_POST`, `REEL_VIDEO`, `COMMENT`, `AVATAR_BIO`
- `ParentConsentStatus`: `PENDING`, `GRANTED`, `REVOKED`
- `FriendshipStatus`: `PENDING`, `ACCEPTED`, `BLOCKED`, `REJECTED`

### Relational Entity Overview

1. **User**: Stores authentication credentials (hashed with argon2/bcrypt), age group, date of birth, role, and active status.
2. **ChildProfile & ParentProfile**: Specialized 1-to-1 profiles. `ChildProfile` contains linked parent IDs, screen-time allowance, daily minutes used, and strict safety overrides.
3. **ParentChildRelationship**: Explicit link table recording verification tokens, consent timestamps, and granular parental permission flags (e.g. `canWatchReels`, `canAddFriends`, `canComment`).
4. **Post**: Represents photo posts. Stores creator ID, asset URLs, caption, moderation status (`PENDING_REVIEW` default), rejection reason, and `adminApprovedAudience`.
5. **Reel**: Represents video shorts/reels. Stores duration (max 60 seconds), aspect ratio, thumbnail URL, video asset URL, **`creatorRequestedAudience`** (mandatory for Reels), and **`adminApprovedAudience`** (final authority).
6. **ModerationQueueItem**: Centralized queue entity for admins. Links to polymorphic content (Post, Reel, Comment, Avatar) with assignment timestamps, priority scoring, review notes, and historical logs.
7. **ModerationAuditLog**: Immutable append-only log capturing `adminId`, `action`, `previousStatus`, `newStatus`, `reason`, `ipAddress`, and `timestamp`.
8. **Comment**: Child comments. Also subject to `ModerationStatus` or keyword auto-filtering.
9. **Friendship**: Two-way friend graph requiring mutual approval and optional parent oversight.
10. **Report**: Community or parent-initiated reports against content or users.

---

## 5. Security & Authentication Architecture

1. **Session & Cookie Model**:
   - Secure server-side sessions stored in database / Redis cache.
   - Session identifiers transmitted via `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
   - API also accepts an optional `Authorization: Bearer <sessionToken>` header so native mobile apps (iOS/Android) can consume identical endpoints without cookie jar complications.
2. **Age-Tier RBAC & Zero-Trust Middleware**:
   - Every request passes through authentication (`requireAuth`), role verification (`requireRole('CHILD' | 'PARENT' | 'ADMIN')`), and age verification (`requireAgeTier(...)`).
   - Query filters enforce `moderationStatus = 'APPROVED'` at the database layer for all non-admin public queries. A child can only view their own pending/rejected items via dedicated private routes.
3. **Child Privacy & COPPA / GDPR-K Alignment**:
   - No personally identifiable information (PII) such as phone numbers, real full names, or physical addresses is made publicly accessible.
   - Real-time location tracking and EXIF metadata stripping are performed on all uploads before storage.

---

## 6. Private Media Storage Workflow (Cloudflare R2 / S3)

To prevent unmoderated content leakage, client uploads never directly hit public buckets:

```
[Client]                  [API Server]                   [R2 Quarantined Bucket]      [R2 Public CDN]
   |                           |                                   |                         |
   | 1. Request Upload Ticket  |                                   |                         |
   |-------------------------->|                                   |                         |
   |                           | 2. Generate Pre-signed PUT URL    |                         |
   |                           |    (Quarantine storage key)       |                         |
   |<--------------------------|                                   |                         |
   | 3. Upload File Directly   |                                   |                         |
   |-------------------------------------------------------------->|                         |
   | 4. Notify API Upload Done |                                   |                         |
   |-------------------------->|                                   |                         |
   |                           | 5. Validate File & Enqueue Mod    |                         |
   |                           |    (Status = PENDING_REVIEW)      |                         |
   |                           |                                   |                         |
   |                           | [Admin Approves Content]          |                         |
   |                           | 6. Move/Promote object to CDN ----+------------------------>|
   |                           |    or activate approved key       |                         |
   |                           | 7. Set Status = APPROVED          |                         |
```

- **Quarantine Bucket**: Unapproved media is kept in a strictly private bucket accessible only via pre-signed, short-lived URLs used exclusively by the Admin Moderation Dashboard.
- **Approved Media CDN**: Only when content transitions to `APPROVED` does the asset become available through the media delivery domain.

---

## 7. Cross-Platform API Readiness (Web, iOS, Android)

All API responses follow a uniform contract:
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120
  }
}
```
Error responses strictly adhere to:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CONTENT_UNAPPROVED",
    "message": "This post is currently awaiting administrative moderation review.",
    "details": []
  }
}
```
This enables seamless consumption by future native iOS and Android clients without requiring breaking API changes or frontend-specific logic in the backend.
