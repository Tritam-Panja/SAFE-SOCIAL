# Troubleshooting & Operational Guide — Fizzy

Common issues, diagnostic procedures, and resolutions for local development and production environments.

---

## 1. Video Processing & FFmpeg Issues

### Symptom: `ffprobe` or `ffmpeg` command not found
- **Root Cause**: The FFmpeg suite is not installed or not in system `PATH`.
- **Resolution**:
  - **Linux / Docker**: Run `apt-get update && apt-get install -y ffmpeg` or `apk add --no-cache ffmpeg`.
  - **macOS**: Run `brew install ffmpeg`.
  - **Windows**: Install via `winget install Gyan.FFmpeg` or extract essentials build to `C:\ffmpeg` and add `C:\ffmpeg\bin` to `PATH`.
  - **Fallback**: The platform includes a non-crashing fallback that returns default video dimensions (1080x1920) and a 1x1 thumbnail if processing utilities are unavailable.

---

## 2. Windows Node.js & Prisma File Lock Contention

### Symptom: `EPERM: operation not permitted, rename query_engine-windows.dll.node.tmp`
- **Root Cause**: Windows anti-virus or active dev servers locking Prisma engine DLLs during regeneration.
- **Resolution**:
  1. Stop all active development servers (`Ctrl+C`).
  2. Kill lingering node processes if necessary (`Get-Process -Name node | Stop-Process -Force` in PowerShell).
  3. Rerun `pnpm run db:generate`.

---

## 3. Database Connection Issues

### Symptom: `Can't reach database server at localhost:5432`
- **Root Cause**: PostgreSQL service is stopped or port is blocked.
- **Resolution**:
  - Verify PostgreSQL status (`sc query postgresql*` or `sudo systemctl status postgresql`).
  - Verify `DATABASE_URL` in `.env` matches credentials and database name.
  - Test raw connectivity: `psql -h localhost -U postgres -d fizzy_dev`.

---

## 4. Cross-Origin (CORS) or Cookie Blocked

### Symptom: `Credentials flag is 'true', but the 'Access-Control-Allow-Credentials' header is ''` or session cookie not sent
- **Root Cause**: Mismatch between `CLIENT_ORIGIN` in backend `.env` and the frontend host domain.
- **Resolution**:
  - In development, ensure `CLIENT_ORIGIN=http://localhost:5173`.
  - In production, set `CLIENT_ORIGIN=https://app.fizzykids.safe`.
  - Note: Browsers will not store cookies with `secure: true` on unencrypted HTTP connections (`http://`). When testing in non-HTTPS local dev, keep `NODE_ENV=development`.

---

## 5. Test State Collisions

### Symptom: Random test assertion failures when running full test suite
- **Root Cause**: Vitest running test files in parallel across shared database records (e.g. `leo_lion_7`).
- **Resolution**:
  - Always execute test runs with `--no-file-parallelism`:
    ```bash
    pnpm --filter @fizzy/api run test
    ```
  - This is already pre-configured in `apps/api/package.json` under `"scripts": { "test": "vitest --no-file-parallelism run" }`.
