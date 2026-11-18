# Fizzy — Kids Safe Social Media Platform

A modern, Instagram-inspired social media web platform specifically designed for children aged 6–17 with **mandatory zero-trust administrator pre-moderation** and age-group-based safety controls.

---

## Age-Group Feed and Content Visibility Engine

The feed system strictly enforces age-based developmental boundaries and zero-trust moderation directly at the **database query level** (`PostgreSQL/Prisma WHERE` clauses), preventing unauthorized content from ever reaching client devices.

### 1. Core Visibility Rules
A child can retrieve only content that satisfies **all 5 criteria**:
1. **Moderation Status**: Status is `APPROVED` or `PUBLISHED`. Never `DRAFT`, `PENDING_REVIEW`, `REJECTED`, or `REMOVED`.
2. **Age-Tier Eligibility**:
   - **For `POST` (Photo Posts)**: Approved posts are eligible across all three age tiers (`JUNIOR`, `EXPLORER`, `TEEN`).
   - **For `SHORT` and `REEL`**: Only children whose age tier matches one of the administrator's `ContentApprovedAudience` entries can retrieve the content.
3. **Quarantine Isolation**: Media asset files must have `isQuarantined: false`.
4. **Blocked User Protection**: Automatically excludes content from users who have blocked or been blocked by the viewing child.
5. **Direct ID Lookup Security**: `GET /api/v1/contents/:id` applies the identical visibility check as feed queries. A child knowing an ID cannot retrieve content outside their age tier (returns `404 CONTENT_UNAVAILABLE`).

---

### 2. Concrete Verification Example

- **Creator Requests**: `JUNIOR` + `EXPLORER` + `TEEN` (e.g. Jordan's skateboarding tutorial).
- **Admin Approves**: `TEEN` only (restricting high kinetic activity).
- **Resulting Access Rights**:
  - `JUNIOR` (Leo): **Cannot see the content** in feed or via direct ID lookup (`404 CONTENT_UNAVAILABLE`).
  - `EXPLORER` (Maya): **Cannot see the content** in feed or via direct ID lookup (`404 CONTENT_UNAVAILABLE`).
  - `TEEN` (Jordan): **Can see and play the content** in `/api/v1/reels/feed` and direct lookup (`200 OK`).

---

## Content & Feed Endpoints

- `GET /api/v1/feed` — Paginated home discovery feed (filtered at database layer by caller's age tier).
- `GET /api/v1/reels/feed` — Paginated video reels and shorts feed (strictly tier-isolated).
- `GET /api/v1/contents/:id` — Direct content inspection enforcing full age-gate security.

---

## Running Verification & Tests

- **Run all automated integration tests (Health, Auth, Media, Moderation, Feed)**:
  ```bash
  pnpm run test:api
  ```
- **Type check the entire monorepo**:
  ```bash
  pnpm run typecheck
  ```
- **Build all packages & apps**:
  ```bash
  pnpm run build
  ```
