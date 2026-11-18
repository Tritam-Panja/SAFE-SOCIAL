# Deployment & Infrastructure Guide — Fizzy

This guide details the steps to deploy the Fizzy child-safe social media web platform to production environments using Cloudflare, Docker/Node.js, and PostgreSQL.

---

## 1. Architecture Overview

Fizzy follows a modern **modular monolith** architecture packaged as a pnpm monorepo:

```
[ Web Client (Vite + React) ] 
       │ (HTTPS / CORS / Strict Session Cookies)
       ▼
[ API Service (Express + Node.js 22 LTS) ]
       │
       ├──► [ PostgreSQL 16+ ] (Relational Storage, Prisma ORM)
       │
       └──► [ Cloudflare R2 ] (Private Quarantine & Approved CDN Buckets)
```

---

## 2. Prerequisites

- **Node.js**: `v20.x` or `v22.x` LTS.
- **pnpm**: `v9.x` or `v10.x` (`npm install -g pnpm`).
- **PostgreSQL**: `15+` or `16+` (e.g., Supabase, Neon, AWS RDS, or managed Cloud SQL).
- **Cloudflare R2**: An active Cloudflare account with R2 enabled.
- **FFmpeg & FFprobe**: Installed on the host or included in your container image (e.g. `apt-get install -y ffmpeg`).

---

## 3. Environment Variables Configuration

Create your production environment file from the template:

```bash
cp .env.example .env
```

Ensure critical variables are set:
1. `NODE_ENV=production`
2. `SESSION_SECRET`: 64+ random characters.
3. `DATABASE_URL`: Production PostgreSQL connection string with SSL enabled.
4. `CLIENT_ORIGIN`: Your frontend domain (e.g. `https://app.fizzykids.safe`).
5. `STORAGE_DRIVER=r2` along with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.
6. `VITE_API_URL`: Backend API endpoint URL (e.g. `https://api.fizzykids.safe/api/v1`).

---

## 4. Database Setup & Production Migration

Run Prisma migrations to create the PostgreSQL schema without seeding demo data:

```bash
# 1. Generate Prisma Client
pnpm run db:generate

# 2. Apply migrations against production database
pnpm --filter @fizzy/api exec prisma migrate deploy --schema=../../prisma/schema.prisma
```

> **Warning:** Do **not** run `db:seed` in production. Seeding is reserved exclusively for development and staging environments.

---

## 5. Building the Monorepo

Compile all TypeScript packages and bundle the frontend client:

```bash
pnpm install --frozen-lockfile
pnpm run build
```

This compiles:
- `@fizzy/shared-types` -> `packages/shared-types/dist`
- `@fizzy/validation` -> `packages/validation/dist`
- `@fizzy/api` -> `apps/api/dist`
- `@fizzy/web` -> `apps/web/dist` (Vite static assets)

---

## 6. Hosting & Serving the Frontend (`apps/web`)

Deploy the compiled output directory `apps/web/dist` to any static hosting provider:
- **Cloudflare Pages**: Point build output to `apps/web/dist`.
- **Vercel / Netlify**: Publish directory `apps/web/dist`.
- **Nginx**: Configure standard Single Page Application (SPA) fallback:
  ```nginx
  server {
      listen 443 ssl http2;
      server_name app.fizzykids.safe;
      root /var/www/fizzy/apps/web/dist;
      index index.html;

      location / {
          try_files $uri $uri/ /index.html;
      }
  }
  ```

---

## 7. Running the Backend Service (`apps/api`)

Start the API service via Node.js or a process supervisor like PM2:

```bash
# Direct launch
NODE_ENV=production node apps/api/dist/server.js

# Or using PM2
pm2 start apps/api/dist/server.js --name "fizzy-api" -i max
```

### Dockerfile (Recommended for Production Containers)

```dockerfile
FROM node:22-alpine AS builder
RUN apk add --no-cache ffmpeg
RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY prisma/ ./prisma/

RUN pnpm install --frozen-lockfile
RUN pnpm run db:generate
RUN pnpm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache ffmpeg
WORKDIR /app

ENV NODE_ENV=production
COPY --from=builder /app ./

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
```

---

## 8. Verifying Deployment Health

Verify the service status using the public health endpoint:

```bash
curl -i https://api.fizzykids.safe/api/v1/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-11-18T16:50:00.000Z",
    "version": "0.1.0",
    "environment": "production"
  },
  "error": null
}
```
