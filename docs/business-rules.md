# Business Rules & Moderation Governance — Kids Social Media Platform

## 1. Core Principles & Philosophy

1. **Child Safety Over Engagement**: Algorithms never optimize for addiction, rage, or infinite screen time. Safety, age appropriateness, and parental agency supersede all growth metrics.
2. **Zero-Trust Pre-Moderation**: No user-generated content (posts, reels, shorts, captions, avatars, bios, comments) becomes publicly accessible or discoverable by any other child before explicit human administrator approval.
3. **Defense in Depth**: Access control and content isolation are enforced strictly on the backend API layer and database query builders, never relying solely on frontend UI hiding.

---

## 2. User Roles & Personas

### 2.1 Role: CHILD
- Must belong to one of three age brackets computed dynamically from date of birth (DOB):
  - **JUNIOR** (Ages 6–8)
  - **EXPLORER** (Ages 9–12)
  - **TEEN** (Ages 13–17)
- Must be linked to at least one verified `PARENT` account (mandatory for Junior and Explorer; Teen requires parental notification/consent per jurisdictional guidelines).
- Can create photo posts and reels (with parental permission flags enabled).
- **Hard Rule**: Children **NEVER** have permission to edit, expedite, or bypass moderation statuses (`PENDING_REVIEW`, `APPROVED`, `REJECTED`).
- Can view their own submitted items in a dedicated "Under Review" / "My Submissions" tab.

### 2.2 Role: PARENT
- Can link one or more child accounts via secure invite code or verified pairing link.
- Has real-time visibility into child activity:
  - Submissions pending review.
  - Approved posts and reels.
  - Friendship list and incoming/outgoing friend requests.
  - Daily screen time and active hours.
- Can configure granular safety controls:
  - Enable/disable Reels/Shorts viewing or creation.
  - Enable/disable comments on child's posts.
  - Set daily usage limits (e.g., max 45 minutes/day) and blackout windows (e.g., no access after 8:00 PM).
  - Suspend or lock the child account on demand.

### 2.3 Role: ADMIN
- Access to the centralized Moderation Queue and Admin Dashboard.
- Evaluates submitted media, captions, user reports, and appealed rejections.
- Holds **final and sovereign decision-making authority** over content approval, rejection, and final approved audience assignment.
- Can escalate suspicious behavior to child protection officers or ban abusive accounts.

---

## 3. Age-Group Rules & Content Segmentation

### 3.1 Age Tiers

| Tier | Age Range | UI Profile & Capabilities | Interaction Permissions |
| :--- | :--- | :--- | :--- |
| **JUNIOR** | 6–8 years | Simplified, large-button, high-contrast, text-light visual UI. Only friend feeds; no public discovery algorithm. | Pre-canned emoji reactions only. No direct freeform text comments unless parent whitelists. |
| **EXPLORER** | 9–12 years | Vibrant, discovery-enabled feed. Filtered hashtag exploration. Short educational & fun reels. | Moderated freeform comments with strict real-time profanity & PII blocklist. |
| **TEEN** | 13–17 years | Instagram-style aesthetic. Full creator tools, music audio overlays, story reels, topic exploration. | Full comment interactions, direct friend messaging (if permitted by parent settings). |

### 3.2 Age-Group Boundary Rules
- **Down-Tier Visibility Rule**: An older child cannot force adult-targeted or mature content onto younger tiers.
- **Cross-Tier Discovery**:
  - A `JUNIOR` user can **only** see content whose `adminApprovedAudience` includes `JUNIOR`.
  - An `EXPLORER` user can see content approved for `EXPLORER` and `JUNIOR`.
  - A `TEEN` user can see content approved for `TEEN`, `EXPLORER`, and `JUNIOR`.
- Users cannot manually bypass their age-group tier. Age tier automatically recalculates based on birthdate on account anniversary.

---

## 4. Content Lifecycle & Moderation Rules

```
     +-------------------------------------------------------+
     |                    CHILD CREATOR                      |
     |  Submits Photo Post (no audience selection)           |
     |  or Reel/Short (mandatory creatorRequestedAudience)   |
     +---------------------------+---------------------------+
                                 |
                                 v
     +-------------------------------------------------------+
     |                 API INGESTION ENGINE                  |
     |  - Media uploaded to Quarantined Storage Bucket       |
     |  - EXIF & Geolocation Metadata stripped               |
     |  - Initial status set to: PENDING_REVIEW              |
     |  - Added to Admin Moderation Queue                    |
     +---------------------------+---------------------------+
                                 |
                                 v
     +-------------------------------------------------------+
     |                 ADMIN MODERATION QUEUE                |
     |  Admin reviews media visual, audio, caption, tags     |
     +---------------------------+---------------------------+
                                 |
                  +--------------+--------------+
                  |                             |
                  v                             v
     +-------------------------+   +-------------------------+
     |     ADMIN APPROVES      |   |      ADMIN REJECTS      |
     | - Sets final            |   | - Specifies rejection   |
     |   adminApprovedAudience |   |   reason (friendly feedback)|
     | - Moves media to        |   | - Status: REJECTED      |
     |   Approved CDN          |   | - Content remains       |
     | - Status: APPROVED      |   |   private & hidden      |
     | - Push notification to  |   | - Constructive advice   |
     |   creator child & parent|   |   sent to child & parent|
     +-------------------------+   +-------------------------+
```

### 4.1 Separation of Creator-Requested vs. Admin-Approved Audience
- **Photo Posts**:
  - The child creator **does not** select an age group. All posts are submitted as general submissions.
  - The Admin reviews the photo and determines the appropriate `adminApprovedAudience` (`JUNIOR`, `EXPLORER`, `TEEN`, or `ALL`).
- **Reels & Shorts**:
  - The creator **is required** to select a `creatorRequestedAudience` upon upload (`JUNIOR`, `EXPLORER`, or `TEEN`). This teaches digital intentionality.
  - The Admin evaluates the reel against platform safety rubrics and sets the official **`adminApprovedAudience`**.
  - **Sovereign Rule**: The Admin's decision is final and takes precedence over `creatorRequestedAudience`. An admin may downgrade a video intended for `JUNIOR` to `TEEN` only, or reject it entirely if deemed inappropriate.

### 4.2 Content Visibility Invariants
1. `moderationStatus !== 'APPROVED'`: Content is strictly inaccessible to anyone other than the content creator and authorized admins.
2. In database queries for public/friend feeds, the condition `WHERE moderationStatus = 'APPROVED' AND adminApprovedAudience @> ARRAY[userAgeGroup]` is mandatory and applied by backend query middleware.
3. If an item is `REJECTED`, the child creator sees an educational, kid-friendly explanation (e.g. *"This photo had personal details like a street sign visible. Please keep private info safe!"*).

---

## 5. Friendship & Interaction Rules

1. **Friend Requests**:
   - To send a friend request, the user must input the friend's unique, child-safe username or scan an in-person friend QR code.
   - For `JUNIOR` accounts, friend requests require parental notification and optional one-click parent confirmation before connection is finalized.
2. **Comments & Reactions**:
   - Comments are subjected to automated real-time heuristic filters (profanity, bullying, phone numbers, email addresses, external links).
   - Any flagged comment automatically enters the `PENDING_REVIEW` queue before becoming visible.
3. **Safety Reporting**:
   - Every piece of content, comment, or profile has a visible, 1-tap "Report / Need Help" button.
   - Submitting a report immediately creates a high-priority ticket in the Admin Moderation Queue and temporarily hides the content from the reporting child's feed.
