# Development & Implementation Plan — Kids Social Media Platform

## Target Prototype Completion: November 21, 2026

---

## 1. Project Phase Breakdown

```
Phase 1: Foundation & Monorepo Setup (Nov 18)
├── Monorepo scaffolding (pnpm/npm workspaces)
├── Shared TypeScript contracts (packages/shared-types)
├── Zod validation suite (packages/validation)
└── Prisma schema with seed data & migrations (PostgreSQL)

Phase 2: Backend Core & Authentication (Nov 18 - 19)
├── Express server with security middlewares (Helmet, CORS, Rate-Limiting)
├── Session management & HttpOnly cookies + Bearer auth adapter
├── Child & Parent registration flows & parent-child pairing
└── Cloudflare R2 / S3 pre-signed upload service with EXIF sanitizer

Phase 3: Moderation Engine & Content Ingestion (Nov 19)
├── Photo post creation (zero audience input from child)
├── Reel & Short video creation (mandatory creatorRequestedAudience)
├── Centralized Moderation Queue API (Approve, Reject, Audience Assignment)
└── Real-time moderation audit log system

Phase 4: Frontend Development (React + Tailwind + shadcn/ui) (Nov 20)
├── Multi-tier layout & styling (Junior vs Explorer vs Teen skins)
├── Child Feed, Reels player, and Submission status tracker
├── Admin Moderation Dashboard with live queue & action triggers
└── Parent Safety Portal (screen time caps, content toggles, friend manager)

Phase 5: Social Dynamics & Safety Layer (Nov 20 - 21)
├── Friendship request & approval system
├── Safe comment filtering & emoji reactions
├── Reporting flow with immediate quarantine
└── Notifications system (SSE/Polling)

Phase 6: Quality Assurance, Testing & Hardening (Nov 21)
├── Unit tests for business logic & age rules (Vitest)
├── API integration tests (Supertest)
├── End-to-end critical flow tests (Playwright)
└── Documentation review & release readiness verification
```

---

## 2. API Endpoints Specification

### 2.1 Authentication & User Management (`/api/v1/auth`, `/api/v1/users`)
- `POST /api/v1/auth/register/child` — Register child account with DOB, username, password, parent email/invite code.
- `POST /api/v1/auth/register/parent` — Register parent account.
- `POST /api/v1/auth/login` — Authenticate and receive session cookie.
- `POST /api/v1/auth/logout` — Invalidate session.
- `GET  /api/v1/auth/me` — Retrieve active authenticated user session with role & age group.
- `POST /api/v1/users/link-child` — Link parent to child using secure pairing code.

### 2.2 Content Ingestion (`/api/v1/posts`, `/api/v1/reels`)
- `POST /api/v1/posts/upload-url` — Get pre-signed URL for photo upload.
- `POST /api/v1/posts` — Finalize photo post submission (No audience input required).
- `GET  /api/v1/posts` — Fetch approved feed posts matching user's age group.
- `GET  /api/v1/posts/my-submissions` — Fetch caller's submitted posts with live moderation status.
- `POST /api/v1/reels/upload-url` — Get pre-signed URL for video reel upload.
- `POST /api/v1/reels` — Finalize reel post submission (Requires `creatorRequestedAudience`).
- `GET  /api/v1/reels` — Fetch approved reels matching user's age group.

### 2.3 Moderation Engine (`/api/v1/moderation`)
- `GET  /api/v1/moderation/queue` — Admin: List items in `PENDING_REVIEW` with priority ordering.
- `GET  /api/v1/moderation/item/:id` — Admin: Fetch item detail with pre-signed quarantine media URL.
- `POST /api/v1/moderation/review/:id` — Admin: Approve/Reject with final `adminApprovedAudience` and notes.
- `GET  /api/v1/moderation/audit-logs` — Admin: View immutable audit trail of all moderation actions.

### 2.4 Parent Safety Controls (`/api/v1/parent`)
- `GET  /api/v1/parent/children` — List linked child accounts.
- `GET  /api/v1/parent/child/:id/activity` — View child's submissions, friends, and screen time.
- `PUT  /api/v1/parent/child/:id/safety-settings` — Update feature toggles (reels, comments, daily minute limits).

### 2.5 Interactions & Safety (`/api/v1/interactions`, `/api/v1/reports`)
- `POST /api/v1/interactions/posts/:id/comment` — Post comment (scanned by safety filter).
- `POST /api/v1/interactions/posts/:id/react` — Add emoji reaction.
- `POST /api/v1/interactions/friends/request` — Send friend request.
- `PUT  /api/v1/interactions/friends/:id/respond` — Accept/Decline friend request.
- `POST /api/v1/reports` — File a safety report on content or user.

---

## 3. Technology Stack & Tooling Decisions

| Layer | Technology | Selection Rationale |
| :--- | :--- | :--- |
| **Monorepo Manager** | pnpm workspaces / npm workspaces | Clean package isolation, fast symlinked dependencies, zero build-tool bloat. |
| **Frontend Framework** | React 18+ & Vite | Lightning-fast HMR, lightweight SPA bundle, optimal for rapid UI development. |
| **UI Library & Styling** | Tailwind CSS & shadcn/ui | Radix-based accessible primitives, total styling customization across Junior/Explorer/Teen skins. |
| **State & Data Fetching**| TanStack Query v5 | Automatic cache invalidation, optimistic updates, smooth background refetching. |
| **Backend Runtime** | Node.js (LTS) & Express | Battle-tested, modular monolith design, high async I/O throughput. |
| **Language** | TypeScript (Strict) | End-to-end type safety shared between API, frontend, and tests. |
| **Database & ORM** | PostgreSQL & Prisma ORM | Relational integrity, declarative migrations, type-safe queries, strong indexing. |
| **Validation** | Zod | Runtime schema validation shared between client forms and API middlewares. |
| **Authentication** | Server-side Sessions (HttpOnly) | Superior security against XSS for kids; supports Bearer tokens for mobile parity. |
| **Testing** | Vitest, Supertest, Playwright | Modern, fast unit/integration testing with browser-level E2E coverage. |

---

## 4. Verification & Testing Strategy

1. **Unit Testing (`tests/unit`)**:
   - Age calculation logic from birth date.
   - Age-group filter resolver ensuring younger tiers cannot receive older-tier content.
   - Zod schema validation checks for missing creator audience on Reels vs. ignored audience on Posts.
2. **Integration Testing (`tests/integration`)**:
   - Authentication gates and role middleware (`ADMIN`, `PARENT`, `CHILD`).
   - Content submission lifecycle: verify a post enters `PENDING_REVIEW` and cannot be fetched via `/api/v1/posts`.
   - Moderation approval flow: verify admin approval shifts status to `APPROVED` and media becomes accessible.
3. **E2E Testing (`tests/e2e`)**:
   - End-to-end flow: Child posts photo -> Photo appears in "My Submissions" -> Admin approves photo in Admin Dashboard -> Photo appears in public Feed.
