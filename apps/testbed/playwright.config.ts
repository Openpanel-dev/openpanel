// Drives the testbed in a real browser against an already-running API, the
// way a customer site would use the SDK. The API is never started from here:
// in a worktree it is supervised, in a plain checkout `bun run dev` runs it.
// The testbed itself is started on demand (or reused if already up).

import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const DEFAULT_PORT = 3100;
// Worktrees get a block of ports starting at WEB_PORT; this offset stays
// clear of the web, api and studio ports the hub hands out.
const WORKTREE_PORT_OFFSET = 9;
const DEFAULT_API_URL = 'http://localhost:3333';
const SEED_FILE = new URL('../../.seed.json', import.meta.url);

type SeedFile = {
  projects: { id: string; archetype: string; clientId: string }[];
};

function readSeededWebsiteClient() {
  if (!existsSync(SEED_FILE)) {
    return;
  }
  const seed = JSON.parse(readFileSync(SEED_FILE, 'utf-8')) as SeedFile;
  const website =
    seed.projects.find((project) => project.archetype === 'website') ??
    seed.projects[0];
  return website?.clientId;
}

const webPort = process.env.WEB_PORT ? Number(process.env.WEB_PORT) : undefined;
export const TESTBED_PORT = Number(
  process.env.TESTBED_PORT ??
    (webPort ? webPort + WORKTREE_PORT_OFFSET : DEFAULT_PORT)
);
export const TESTBED_URL = `http://localhost:${TESTBED_PORT}`;

// Plain http to the API process beats the worktree's self-signed https proxy.
const apiUrl =
  process.env.VITE_OPENPANEL_API_URL ??
  process.env.API_URL_SSR ??
  process.env.API_URL ??
  DEFAULT_API_URL;
const clientId =
  process.env.VITE_OPENPANEL_CLIENT_ID ?? readSeededWebsiteClient();

if (!clientId) {
  throw new Error(
    'No client id: set VITE_OPENPANEL_CLIENT_ID or seed the database (bun run seed) so .seed.json exists'
  );
}

export default defineConfig({
  testDir: 'e2e',
  // Longer than the ClickHouse poll, so a missing row fails with the list of
  // what was stored instead of a bare test timeout.
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: TESTBED_URL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    url: TESTBED_URL,
    reuseExistingServer: true,
    env: {
      ...process.env,
      TESTBED_PORT: String(TESTBED_PORT),
      VITE_OPENPANEL_API_URL: apiUrl,
      VITE_OPENPANEL_CLIENT_ID: clientId,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
