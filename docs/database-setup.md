# Database Setup & Management Guide — Fizzy

This guide outlines database provisioning, migrations, schema maintenance, and demo data seeding.

---

## 1. PostgreSQL Prerequisites

Fizzy requires **PostgreSQL 14+** (recommended **16+**) with `uuid-ossp` or native UUID support.

Ensure database character encoding is set to `UTF8`:
```sql
CREATE DATABASE fizzy_prod WITH ENCODING 'UTF8';
```

---

## 2. Prisma Architecture

- **Schema Location**: `prisma/schema.prisma`
- **Client Output**: `apps/api/src/generated/prisma-client`
- **Migrations Directory**: `prisma/migrations`

### Generating the Prisma Client

Whenever `prisma/schema.prisma` is updated, regenerate the typed client:

```bash
pnpm run db:generate
```

---

## 3. Migration Workflows

### A. Development Environments
During local feature development, create and apply migrations with:

```bash
pnpm --filter @fizzy/api exec prisma migrate dev --schema=../../prisma/schema.prisma --name add_new_feature
```

### B. Production Environments
In production pipelines (CI/CD, Kubernetes Init Containers, or release hooks), apply existing migrations safely without generating new ones:

```bash
pnpm --filter @fizzy/api exec prisma migrate deploy --schema=../../prisma/schema.prisma
```

---

## 4. Seeding Demo Data (Non-Production Only)

To populate development or QA staging databases with realistic children, parents, age groups, approved posts, and safety controls:

```bash
pnpm run db:seed
```

This creates:
- **1 Safety Administrator**: `safety_admin`
- **1 Parent Guardian**: `guardian_sarah`
- **3 Children across tiers**:
  - `leo_lion_7` (Junior, age 7)
  - `maya_explorer` (Explorer, age 10)
  - `jordan_teen_skater` (Teen, age 15)
- Pre-seeded friendships, parent-child links, moderation items, and sample posts.
