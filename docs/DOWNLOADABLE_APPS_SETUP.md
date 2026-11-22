# Downloadable Desktop (.EXE) & Mobile (.APK) Build Guide

Fizzy is configured for multi-platform distribution using **Electron** for Windows Desktop and **Capacitor** for Android Mobile.

Automated builds and downloadable releases are powered by GitHub Actions.

---

## 1. Automated Builds via GitHub Actions

The workflow file is located at [`.github/workflows/build-apps.yml`](file:///c:/Users/Admin/OneDrive/Desktop/Fizzy/.github/workflows/build-apps.yml).

### How to Trigger a Build
1. **Push to GitHub:** Whenever you push code to `main` (or `master`), the workflow runs automatically.
2. **Manual Trigger (Workflow Dispatch):**
   - Go to your GitHub repository.
   - Click the **Actions** tab.
   - Select **"Build Desktop (.EXE) & Mobile (.APK)"**.
   - Click **Run workflow**.

### Downloading the Outputs
Once the workflow completes (typically ~3–5 minutes):
- Scroll down to the **Artifacts** section at the bottom of the workflow run page:
  - **`fizzy-windows-installer`**: Contains the Windows setup installer (`Fizzy Setup 0.1.0.exe`).
  - **`fizzy-android-apk`**: Contains the Android mobile APK (`app-debug.apk`) ready for installation on Android smartphones or tablets.

---

## 2. Local Desktop Development & Build (Windows .EXE)

### Run Desktop App in Development Mode:
```powershell
pnpm run dev:electron
```
*This launches the Vite dev server and opens Fizzy inside a native desktop window.*

### Build `.exe` Installer Locally:
```powershell
pnpm run build:electron
```
*The generated setup file will be saved in `dist-electron/` (e.g., `dist-electron/Fizzy Setup 0.1.0.exe`).*

---

## 3. Local Android Mobile Build (.APK)

### Sync Web App to Android Native Project:
Whenever you make changes to the React frontend:
```powershell
pnpm --filter @fizzy/web run build
pnpm run cap:sync
```

### Open in Android Studio:
```powershell
cd apps/web
pnpm exec cap open android
```
From Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)** to generate the `.apk`.

---

## 4. Configuration & API Endpoint
In `.github/workflows/build-apps.yml`, the environment variable `VITE_API_URL` configures which backend API the desktop and mobile apps talk to.

To point your `.exe` and `.apk` to your live production server:
1. Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Add a repository secret named **`PROD_API_URL`**:
   ```
   https://api.yourdomain.com/api/v1
   ```
If omitted, it defaults to `https://api.fizzykids.safe/api/v1`.
