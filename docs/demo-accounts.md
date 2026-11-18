# Demo Accounts & Verification Guide — Fizzy

For functional verification, manual testing, and demonstrations, the database seed provides accounts covering each user role and age tier.

---

## 1. Credentials Directory

All pre-seeded accounts share the default development password:
```
Password123!
```

| Role | Username | Age Tier | Age | Purpose / Capabilities |
|---|---|---|:---:|---|
| **ADMIN** | `safety_admin` | N/A | Adult | Access to Moderation Queue, Metrics, Reports, User Management, and Review Suite. |
| **PARENT** | `guardian_sarah` | N/A | Adult | Parent dashboard, linked children safety controls (pause account, toggle commenting/friends). |
| **CHILD** | `leo_lion_7` | `JUNIOR` | 7 | Junior tier experience (ages 6–8): simplified UI, strictly moderated discovery. Linked to `guardian_sarah`. |
| **CHILD** | `maya_explorer` | `EXPLORER` | 10 | Explorer tier experience (ages 9–12): creative sharing, photo posts, short videos. |
| **CHILD** | `jordan_teen_skater` | `TEEN` | 15 | Teen tier experience (ages 13–17): Reels, advanced social interaction, broader age-appropriate feed. |

---

## 2. Parent-Child Linking Demonstration

- **Child**: `leo_lion_7`
- **Parent**: `guardian_sarah`
- **Parent Linking Code**: Available on child's Profile screen or retrieved via API (`GET /users/me`).
- **Demo Verification Code**: `DEMO-LINK-123` (configured as prototype bypass for testing).

---

## 3. Recommended Demonstration Flows

1. **Moderation Queue Inspection**:
   - Log in as `safety_admin`.
   - Open `/moderation` -> Review pending submissions.
   - Test approving a Reel with audience restriction (e.g. approve for `TEEN` only).
2. **Age-Group Feed Comparison**:
   - Log in as `jordan_teen_skater` (`TEEN`) -> Reel is visible in `/reels/feed`.
   - Log in as `leo_lion_7` (`JUNIOR`) -> Reel is strictly omitted from feed.
3. **Parent Guardrail Control**:
   - Log in as `guardian_sarah` -> Open `/parent`.
   - Toggle **Account Paused** on `leo_lion_7`.
   - Switch to `leo_lion_7` session -> verify commenting and posting actions are halted with `ACCOUNT_PAUSED_BY_PARENT`.
