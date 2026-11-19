# Real-Time Infrastructure Architecture (Socket.IO)

## Overview
Fizzy incorporates a centralized, authenticated real-time communication infrastructure powered by **Socket.IO v4**. The system enables bidirectional, event-driven synchronization across multiple concurrent client devices while strictly enforcing safety guardrails, role boundaries, and parent controls.

The real-time layer operates as an **auxiliary synchronization and notification conduit**:
> **Authoritative Invariant**: The PostgreSQL database and Express REST API remain the single source of truth. Socket events deliver live notifications and feed invalidations. When clients reconnect or miss events, standard REST queries synchronize the client state.

---

## Architecture Topology

```
┌────────────────────────────────────────────────────────┐
│               Client Browsers & Devices                │
│  (React 18 + Vite / Socket.IO Client / RealtimeContext) │
└───────────▲────────────────────────────────▲───────────┘
            │                                │
     WebSocket / Polling              WebSocket / Polling
     (Bearer Token / Cookie)          (Bearer Token / Cookie)
            │                                │
┌───────────▼────────────────────────────────▼───────────┐
│                    Express HTTP Server                 │
│               Attached Socket.IO Server Engine         │
├────────────────────────────────────────────────────────┤
│ Handshake Authentication & Active Session Verification │
├────────────────────────────────────────────────────────┤
│              Server-Assigned Room Topology             │
│                                                        │
│  • user:<userId>          (Personal notifications)     │
│  • role:admin             (Moderator alerts/reports)   │
│  • age:<ageGroup>         (Age-tier feed updates)      │
│  • family:<parent>:<kid>  (Parent-child safety guard)  │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌──────────────────────┐        ┌────────────────────────┐
│ Prisma ORM / Postgres │        │ REST API Route Triggers│
│  (Authoritative DB)  │        │ (Posts, Reels, Mod...) │
└──────────────────────┘        └────────────────────────┘
```

---

## 1. Authentication & Session Lifecycle

### 1.1 Handshake Middleware
Every incoming WebSocket handshake is authenticated before connection admission:
1. **Extraction**: Checks handshake `auth.token`, `headers.authorization` (`Bearer <token>`), or HTTP-only signed/unsigned cookie (`fizzy_session`).
2. **Session Validation**: Invokes `SessionService.validateSession(token)`.
3. **Identity Verification**:
   - Checks that the associated user exists.
   - Verifies `user.isActive === true`.
   - Confirms user role matches `CHILD`, `PARENT`, or `ADMIN`.
4. **Rejection**: If the token is missing, expired, or invalid, or if the account is deactivated, connection is rejected with `UNAUTHORIZED` or `ACCOUNT_INACTIVE`.

### 1.2 In-Flight Session Monitoring
- Active sockets attach a packet middleware checking database session status.
- When a user logs out (`POST /api/v1/auth/logout`) or their session is revoked:
  - Calling `realtime.disconnectUser(userId, 'SESSION_TERMINATED')` terminates all active sockets across all browser windows/tabs for that user.

### 1.3 Multi-Session & Multi-Device Support
- A single user may connect from multiple browser tabs or devices simultaneously.
- Each connection gets an isolated socket instance, but all join the unified `user:<userId>` room.
- Events dispatched to `user:<userId>` reach all concurrent tabs seamlessly.

---

## 2. Server-Enforced Room Architecture

Clients **cannot** request to join arbitrary rooms. All room memberships are computed and enforced server-side upon successful authentication:

| Room Pattern | Enrolled Participants | Security & Isolation Rules |
| :--- | :--- | :--- |
| `user:<userId>` | Sockets belonging to `<userId>` | Strictly isolated. No other user can join or listen to this room. |
| `role:admin` | Users with `role === ADMIN` | Prohibited for `CHILD` and `PARENT` accounts. Emits reports, submissions, and audit alerts. |
| `age:<ageGroup>` | Children with matching age tier (`JUNIOR`, `EXPLORER`, `TEEN`) | Assigned based on child's calculated birthday tier. Used for age-tier feed updates. |
| `family:<parentId>:<childId>` | Parent and child linked via accepted relationship | Enforces parental supervision and real-time guardrail sync. |

---

## 3. Reconnection & Resilience

- **Automatic Reconnection**: Clients configure automatic exponential backoff reconnection (`reconnectionDelay: 1000`, `reconnectionAttempts: 10`).
- **Network Interruption**: When a network drop occurs, the UI updates connection status to `Offline` and retries automatically.
- **Graceful Shutdown**: On `SIGTERM` or `SIGINT`, `RealtimeServer.close()` disconnects all active sockets with `SERVER_SHUTDOWN` and shuts down the Socket.IO engine before closing the HTTP server and database pool.
