import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'msedge',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @fizzy/api run dev',
      port: 4000,
      reuseExistingServer: true,
      timeout: 20000,
    },
    {
      command: 'pnpm --filter @fizzy/web run dev',
      port: 5173,
      reuseExistingServer: true,
      timeout: 20000,
    },
  ],
});
