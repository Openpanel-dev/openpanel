// Runs against an already-running dashboard (a worktree's processes are supervised
// for it), so there is no `webServer` block. `DASHBOARD_URL` names it; a plain
// checkout sets it or falls back to the dev port.

import { defineConfig, devices } from '@playwright/test';

const DEV_DASHBOARD_URL = 'http://localhost:3000';
const AUTH_STATE_FILE = 'e2e/.auth/user.json';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.DASHBOARD_URL ?? DEV_DASHBOARD_URL,
    // A worktree's HTTPS certificate is from a local CA Playwright's Chromium does not trust.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE_FILE },
      dependencies: ['setup'],
    },
  ],
});
