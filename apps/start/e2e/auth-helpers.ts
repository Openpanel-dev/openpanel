import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Locator, Page, Response } from '@playwright/test';

export const FRESH_CONTEXT = { cookies: [], origins: [] };
export const SHOTS_DIR = 'test-results/auth/shots';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
// RFC 4226 dynamic truncation: the low nibble picks the offset, the top bit is dropped.
const TOTP_OFFSET_MODULUS = 16;
const TOTP_SIGN_BIT = 2 ** 31;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// The API allows 3 `auth.signInEmail` calls per 30s for the whole local stack
// (every loopback client shares one bucket) and answers the 4th with a 5 minute
// block that doubles on each repeat. Spacing our own attempts keeps a run under
// it; the timestamp lives in a file because a failed test restarts the worker.
const SIGN_IN_SPACING_MS = 11_000;
const SIGN_IN_CLOCK_FILE = 'test-results/auth/.last-sign-in';
const TOO_MANY_REQUESTS = 429;

export async function waitForSignInSlot(): Promise<void> {
  const lastSignInAt = existsSync(SIGN_IN_CLOCK_FILE)
    ? Number(readFileSync(SIGN_IN_CLOCK_FILE, 'utf8'))
    : 0;
  const wait = lastSignInAt + SIGN_IN_SPACING_MS - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  mkdirSync(dirname(SIGN_IN_CLOCK_FILE), { recursive: true });
  writeFileSync(SIGN_IN_CLOCK_FILE, String(Date.now()));
}

/** Submits the /login form (the page must already be on it) and returns the API's answer. */
export async function submitSignIn(
  page: Page,
  credentials: { email: string; password: string }
): Promise<Response> {
  await waitForSignInSlot();
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  const answer = page.waitForResponse((response) =>
    response.url().includes('/trpc/auth.signInEmail')
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const response = await answer;
  if (response.status() === TOO_MANY_REQUESTS) {
    throw new Error(
      'auth.signInEmail is rate limited (shared bucket). Wait for the block to expire and rerun.'
    );
  }
  return response;
}

export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-sonner-toast]').filter({ hasText: text });
}

/** New accounts get a fixed "Share Your Feedback" card that covers the bottom-right corner. */
export async function dismissFeedbackPrompt(page: Page): Promise<void> {
  const prompt = page.locator('div.fixed').filter({
    has: page.getByRole('heading', { name: 'Share Your Feedback' }),
  });
  if (await prompt.count()) {
    await prompt.getByRole('button').first().click();
    await prompt.waitFor({ state: 'hidden' });
  }
}

export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
}

/** Noise a local dev stack produces that says nothing about the page under test. */
const IGNORED_ISSUES = [
  /api\.openpanel\.dev/,
  /hydrat/i,
  /favicon/,
  // The `response` listener reports the same failure with its URL.
  /Failed to load resource/,
  /\/@vite|\/@id\/|\/src\/|node_modules/,
  /cdn\.userjot\.com/,
  /requires a `DialogTitle`|aria-describedby/,
];

export interface IssueLog {
  all: string[];
  /** Entries that are not known dev noise and not listed in `expected`. */
  unexpected(expected?: RegExp[]): string[];
}

export function watchIssues(page: Page): IssueLog {
  const all: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      all.push(`console: ${message.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => all.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      all.push(
        `response ${response.status()} ${response.request().method()} ${response.url().slice(0, 200)}`
      );
    }
  });
  return {
    all,
    unexpected: (expected = []) =>
      all.filter(
        (entry) =>
          !(
            IGNORED_ISSUES.some((pattern) => pattern.test(entry)) ||
            expected.some((pattern) => pattern.test(entry))
          )
      ),
  };
}

function decodeBase32(secret: string): Buffer {
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** RFC 6238 with the app's parameters: SHA-1, 30 second step, 6 digits. */
export function totpCode(secret: string, atMs = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(
    BigInt(Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS))
  );
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = (digest.at(-1) ?? 0) % TOTP_OFFSET_MODULUS;
  const binary = digest.readUInt32BE(offset) % TOTP_SIGN_BIT;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** A syntactically valid code the server must reject. */
export function wrongTotpCode(secret: string): string {
  const valid = new Set(
    [-60_000, -30_000, 0, 30_000, 60_000].map((drift) =>
      totpCode(secret, Date.now() + drift)
    )
  );
  let candidate = 123_456;
  while (valid.has(String(candidate))) {
    candidate += 1;
  }
  return String(candidate);
}

export function apiUrl(): string {
  return (
    process.env.API_URL ??
    (process.env.DASHBOARD_URL ?? '').replace('://', '://api.')
  );
}

/** Sends one event through the real ingest pipeline, as a customer's server would. */
export function trackEvent(
  client: { id: string; secret: string },
  name: string
): string {
  return execFileSync('curl', [
    '-sSk',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    '-X',
    'POST',
    `${apiUrl()}/track`,
    '-H',
    'content-type: application/json',
    '-H',
    `openpanel-client-id: ${client.id}`,
    '-H',
    `openpanel-client-secret: ${client.secret}`,
    '-H',
    'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
    '-H',
    'x-client-ip: 81.2.69.142',
    '-d',
    JSON.stringify({ type: 'track', payload: { name, properties: {} } }),
  ]).toString();
}

const HYDRATION_TIMEOUT_MS = 45_000;

function isHydrated(page: Page): Promise<unknown> {
  return page.waitForFunction(
    () => {
      const element = document.querySelector('button, input, a');
      return (
        element !== null &&
        Object.keys(element).some((key) => key.startsWith('__reactProps'))
      );
    },
    undefined,
    { timeout: HYDRATION_TIMEOUT_MS }
  );
}

/**
 * Pages are server-rendered: a click that lands before React hydrates is lost
 * (or submits a form natively). React tags hydrated nodes with `__reactProps$…`.
 * A dev server shared by several suites sometimes drops a module request and
 * the page never hydrates; one reload recovers it.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  try {
    await isHydrated(page);
  } catch {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await isHydrated(page);
  }
}

export async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForHydration(page);
}
