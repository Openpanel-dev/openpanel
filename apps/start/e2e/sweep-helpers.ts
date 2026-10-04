import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { APIRequestContext, Page, Response } from '@playwright/test';

export const ORGANIZATION_ID = 'acme';
export const API_URL =
  process.env.API_URL ?? 'https://api.main.local.openpanel.cc';
export const OUTPUT_DIR = resolve(
  import.meta.dirname,
  '..',
  'test-results',
  'sweep'
);
export const SLOW_LOAD_MS = 5000;
const NETWORK_IDLE_TIMEOUT_MS = 12_000;
const BLANK_PAGE_MAX_CHARS = 20;
const SNIPPET_RADIUS = 40;

type IdKind =
  | 'profile'
  | 'session'
  | 'group'
  | 'cohort'
  | 'dashboard'
  | 'report';

export type ProjectIds = Record<IdKind, string | null>;

export interface RouteSpec {
  /** Route file pattern, used as the row label. */
  route: string;
  /** Path below `/$organizationId/$projectId`, or an absolute path when `scope` is not project. */
  path: (ids: ProjectIds) => string | null;
  scope: 'project' | 'organization' | 'global';
}

const fixed = (path: string) => () => path;
const withId = (kind: IdKind, suffix = '') => {
  const plural = `${kind}s`;
  return (ids: ProjectIds) =>
    ids[kind] ? `/${plural}/${encodeURIComponent(ids[kind])}${suffix}` : null;
};

export const PROJECT_ROUTES: RouteSpec[] = [
  { route: '$projectId/ (overview)', path: fixed(''), scope: 'project' },
  { route: 'pages', path: fixed('/pages'), scope: 'project' },
  { route: 'realtime', path: fixed('/realtime'), scope: 'project' },
  { route: 'insights', path: fixed('/insights'), scope: 'project' },
  { route: 'seo', path: fixed('/seo'), scope: 'project' },
  { route: 'references', path: fixed('/references'), scope: 'project' },
  { route: 'dashboards', path: fixed('/dashboards'), scope: 'project' },
  {
    route: 'dashboards/$dashboardId',
    path: withId('dashboard'),
    scope: 'project',
  },
  { route: 'reports (new)', path: fixed('/reports'), scope: 'project' },
  { route: 'reports/$reportId', path: withId('report'), scope: 'project' },
  { route: 'events', path: fixed('/events'), scope: 'project' },
  { route: 'events/events', path: fixed('/events/events'), scope: 'project' },
  {
    route: 'events/conversions',
    path: fixed('/events/conversions'),
    scope: 'project',
  },
  { route: 'events/stats', path: fixed('/events/stats'), scope: 'project' },
  { route: 'sessions', path: fixed('/sessions'), scope: 'project' },
  { route: 'sessions/$sessionId', path: withId('session'), scope: 'project' },
  { route: 'profiles', path: fixed('/profiles'), scope: 'project' },
  {
    route: 'profiles/identified',
    path: fixed('/profiles/identified'),
    scope: 'project',
  },
  {
    route: 'profiles/anonymous',
    path: fixed('/profiles/anonymous'),
    scope: 'project',
  },
  {
    route: 'profiles/power-users',
    path: fixed('/profiles/power-users'),
    scope: 'project',
  },
  { route: 'profiles/$profileId', path: withId('profile'), scope: 'project' },
  {
    route: 'profiles/$profileId/events',
    path: withId('profile', '/events'),
    scope: 'project',
  },
  {
    route: 'profiles/$profileId/sessions',
    path: withId('profile', '/sessions'),
    scope: 'project',
  },
  { route: 'groups', path: fixed('/groups'), scope: 'project' },
  { route: 'groups/$groupId', path: withId('group'), scope: 'project' },
  {
    route: 'groups/$groupId/events',
    path: withId('group', '/events'),
    scope: 'project',
  },
  {
    route: 'groups/$groupId/members',
    path: withId('group', '/members'),
    scope: 'project',
  },
  { route: 'cohorts', path: fixed('/cohorts'), scope: 'project' },
  { route: 'cohorts/$cohortId', path: withId('cohort'), scope: 'project' },
  {
    route: 'cohorts/$cohortId/events',
    path: withId('cohort', '/events'),
    scope: 'project',
  },
  {
    route: 'cohorts/$cohortId/members',
    path: withId('cohort', '/members'),
    scope: 'project',
  },
  { route: 'integrations', path: fixed('/integrations'), scope: 'project' },
  {
    route: 'integrations/available',
    path: fixed('/integrations/available'),
    scope: 'project',
  },
  {
    route: 'integrations/installed',
    path: fixed('/integrations/installed'),
    scope: 'project',
  },
  { route: 'notifications', path: fixed('/notifications'), scope: 'project' },
  {
    route: 'notifications/notifications',
    path: fixed('/notifications/notifications'),
    scope: 'project',
  },
  {
    route: 'notifications/rules',
    path: fixed('/notifications/rules'),
    scope: 'project',
  },
  { route: 'settings', path: fixed('/settings'), scope: 'project' },
  {
    route: 'settings/details',
    path: fixed('/settings/details'),
    scope: 'project',
  },
  {
    route: 'settings/events',
    path: fixed('/settings/events'),
    scope: 'project',
  },
  {
    route: 'settings/clients',
    path: fixed('/settings/clients'),
    scope: 'project',
  },
  {
    route: 'settings/tracking',
    path: fixed('/settings/tracking'),
    scope: 'project',
  },
  {
    route: 'settings/widgets',
    path: fixed('/settings/widgets'),
    scope: 'project',
  },
  {
    route: 'settings/imports',
    path: fixed('/settings/imports'),
    scope: 'project',
  },
  { route: 'settings/mcp', path: fixed('/settings/mcp'), scope: 'project' },
  { route: 'settings/gsc', path: fixed('/settings/gsc'), scope: 'project' },
];

export const ORGANIZATION_ROUTES: RouteSpec[] = [
  { route: '/ (index)', path: fixed('/'), scope: 'global' },
  { route: '$organizationId/', path: fixed(''), scope: 'organization' },
  {
    route: '$organizationId/settings',
    path: fixed('/settings'),
    scope: 'organization',
  },
  {
    route: '$organizationId/billing',
    path: fixed('/billing'),
    scope: 'organization',
  },
  {
    route: '$organizationId/members',
    path: fixed('/members'),
    scope: 'organization',
  },
  {
    route: '$organizationId/members/members',
    path: fixed('/members/members'),
    scope: 'organization',
  },
  {
    route: '$organizationId/members/invitations',
    path: fixed('/members/invitations'),
    scope: 'organization',
  },
  {
    route: '$organizationId/account',
    path: fixed('/account'),
    scope: 'organization',
  },
  {
    route: '$organizationId/account/email-preferences',
    path: fixed('/account/email-preferences'),
    scope: 'organization',
  },
  {
    route: '$organizationId/account/two-factor',
    path: fixed('/account/two-factor'),
    scope: 'organization',
  },
  { route: '/account', path: fixed('/account'), scope: 'global' },
  { route: '/login (signed in)', path: fixed('/login'), scope: 'global' },
  {
    route: '/reset-password (no token)',
    path: fixed('/reset-password'),
    scope: 'global',
  },
  { route: '/verify', path: fixed('/verify'), scope: 'global' },
  { route: '/onboarding', path: fixed('/onboarding'), scope: 'global' },
  {
    route: '/onboarding/project',
    path: fixed('/onboarding/project'),
    scope: 'global',
  },
  {
    route: '/onboarding/$projectId/connect',
    path: fixed('/onboarding/acme-shop/connect'),
    scope: 'global',
  },
  {
    route: '/onboarding/$projectId/verify',
    path: fixed('/onboarding/acme-shop/verify'),
    scope: 'global',
  },
  {
    route: '/unsubscribe (no token)',
    path: fixed('/unsubscribe'),
    scope: 'global',
  },
];

export function resolveUrl(
  spec: RouteSpec,
  projectId: string,
  ids: ProjectIds
): string | null {
  const path = spec.path(ids);
  if (path === null) {
    return null;
  }
  if (spec.scope === 'project') {
    return `/${ORGANIZATION_ID}/${projectId}${path}`;
  }
  if (spec.scope === 'organization') {
    return `/${ORGANIZATION_ID}${path}`;
  }
  return path;
}

export async function trpcQuery<T>(
  request: APIRequestContext,
  procedure: string,
  input: unknown
): Promise<T | null> {
  const response = await request.get(`${API_URL}/trpc/${procedure}`, {
    params: { input: JSON.stringify({ json: input }) },
    ignoreHTTPSErrors: true,
  });
  if (!response.ok()) {
    return null;
  }
  const body = await response.json();
  return (body?.result?.data?.json ?? null) as T | null;
}

export async function resolveProjectIds(
  request: APIRequestContext,
  projectId: string
): Promise<ProjectIds> {
  const [profiles, sessions, groups, cohorts, dashboards] = await Promise.all([
    trpcQuery<{ data: { id: string }[] }>(request, 'profile.list', {
      projectId,
      take: 1,
    }),
    trpcQuery<{ items: { id: string }[] }>(request, 'session.list', {
      projectId,
      take: 1,
    }),
    trpcQuery<{ data: { id: string }[] }>(request, 'group.list', {
      projectId,
      take: 1,
    }),
    trpcQuery<{ id: string }[]>(request, 'cohort.list', { projectId }),
    trpcQuery<{ id: string }[]>(request, 'dashboard.list', { projectId }),
  ]);
  const dashboard = dashboards?.[0]?.id ?? null;
  const reports = dashboard
    ? await trpcQuery<{ id: string }[]>(request, 'report.list', {
        projectId,
        dashboardId: dashboard,
      })
    : null;
  return {
    profile: profiles?.data?.[0]?.id ?? null,
    session: sessions?.items?.[0]?.id ?? null,
    group: groups?.data?.[0]?.id ?? null,
    cohort: cohorts?.[0]?.id ?? null,
    dashboard,
    report: reports?.[0]?.id ?? null,
  };
}

export interface BadResponse {
  status: number;
  procedure: string;
  message: string;
}

export interface Recorder {
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  badResponses: BadResponse[];
  failedRequests: string[];
  /** Every 401 and every document navigation of the whole run; never reset, to explain surprise redirects. */
  authTrail: string[];
  reset: () => void;
  snapshot: () => Omit<Recorder, 'reset' | 'snapshot' | 'authTrail'>;
}

const NOISE = [
  /\[vite\]/i,
  /favicon/i,
  /sentry/i,
  /Download the React DevTools/i,
  /hot[- ]update/i,
  /api\.openpanel\.dev\/track/,
];

const isNoise = (text: string) => NOISE.some((pattern) => pattern.test(text));

async function describeBadResponse(response: Response): Promise<BadResponse> {
  const url = new URL(response.url());
  const procedure = url.pathname.includes('/trpc/')
    ? url.pathname.split('/trpc/')[1]
    : `${response.request().method()} ${url.host}${url.pathname}`;
  let message = '';
  try {
    const text = await response.text();
    const parsed = JSON.parse(text);
    const first = Array.isArray(parsed) ? parsed.find((p) => p.error) : parsed;
    message =
      first?.error?.json?.message ??
      first?.error?.message ??
      first?.message ??
      text.slice(0, 200);
  } catch {
    message = '(no readable body)';
  }
  return {
    status: response.status(),
    procedure,
    message: String(message).slice(0, 300),
  };
}

export function attachRecorder(page: Page): Recorder {
  const recorder: Recorder = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    badResponses: [],
    failedRequests: [],
    authTrail: [],
    reset() {
      recorder.consoleErrors = [];
      recorder.consoleWarnings = [];
      recorder.pageErrors = [];
      recorder.badResponses = [];
      recorder.failedRequests = [];
    },
    snapshot() {
      return {
        consoleErrors: [...recorder.consoleErrors],
        consoleWarnings: [...recorder.consoleWarnings],
        pageErrors: [...recorder.pageErrors],
        badResponses: [...recorder.badResponses],
        failedRequests: [...recorder.failedRequests],
      };
    },
  };
  page.on('console', (message) => {
    const text = message.text();
    if (isNoise(`${text} ${message.location().url}`)) {
      return;
    }
    if (message.type() === 'error') {
      recorder.consoleErrors.push(text.slice(0, 6000));
    }
    if (message.type() === 'warning') {
      recorder.consoleWarnings.push(text.slice(0, 600));
    }
  });
  page.on('pageerror', (error) => {
    recorder.pageErrors.push(error.message.slice(0, 8000));
  });
  page.on('response', (response) => {
    const isDocument = response.request().resourceType() === 'document';
    if (response.status() === 401 || isDocument) {
      recorder.authTrail.push(
        `${new Date().toISOString()} ${response.status()} ${response.url().slice(0, 160)} (page at ${page.url()})`
      );
    }
    if (response.status() < 400 || isNoise(response.url())) {
      return;
    }
    describeBadResponse(response).then((bad) =>
      recorder.badResponses.push(bad)
    );
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    const isAborted = failure.includes('ERR_ABORTED');
    if (isAborted || isNoise(request.url())) {
      return;
    }
    recorder.failedRequests.push(`${request.url()} ${failure}`.slice(0, 300));
  });
  return recorder;
}

const SUSPICIOUS_TEXT: [string, RegExp][] = [
  ['undefined', /\bundefined\b/],
  ['NaN', /\bNaN\b/],
  ['null', /\bnull\b/],
  ['Invalid Date', /Invalid Date/i],
  ['No match', /No match/],
  ['[object Object]', /\[object Object\]/],
  ['Something went wrong', /Something went wrong/i],
  ['Not found', /\bnot found\b/i],
  ['error boundary', /unexpected error|an error occurred|try again/i],
];

export interface PageState {
  suspicious: { label: string; snippet: string }[];
  isBlank: boolean;
  textLength: number;
  horizontalOverflowPx: number;
  title: string;
}

export async function inspectPage(page: Page): Promise<PageState> {
  const { text, overflow, title } = await page.evaluate(() => ({
    text: document.body?.innerText ?? '',
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    title: document.title,
  }));
  const suspicious: PageState['suspicious'] = [];
  for (const [label, pattern] of SUSPICIOUS_TEXT) {
    const match = pattern.exec(text);
    if (!match) {
      continue;
    }
    const start = Math.max(0, match.index - SNIPPET_RADIUS);
    const end = match.index + match[0].length + SNIPPET_RADIUS;
    suspicious.push({
      label,
      snippet: text.slice(start, end).replace(/\s+/g, ' '),
    });
  }
  return {
    suspicious,
    isBlank: text.trim().length < BLANK_PAGE_MAX_CHARS,
    textLength: text.trim().length,
    horizontalOverflowPx: overflow,
    title,
  };
}

const HYDRATION_TIMEOUT_MS = 45_000;
const CLIENT_NAVIGATION_START_MS = 700;
const SKELETON_TIMEOUT_MS = 15_000;
const SKELETON_SELECTOR = '.animate-pulse';

/** The dev server ships ~1200 unbundled modules, so React attaches many seconds after `load`. */
export async function waitForHydration(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('body div, body a, body button'))
          .slice(0, 40)
          .some((element) =>
            Object.keys(element).some((key) => key.startsWith('__react'))
          ),
      undefined,
      { timeout: HYDRATION_TIMEOUT_MS }
    );
    return true;
  } catch {
    return false;
  }
}

/** Waits for the page to settle; returns false when the network never went idle. */
export async function settle(page: Page): Promise<boolean> {
  await waitForHydration(page);
  let wentIdle = true;
  try {
    await page.waitForLoadState('networkidle', {
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    });
  } catch {
    wentIdle = false;
  }
  await page
    .waitForFunction(
      (selector) => document.querySelectorAll(selector).length === 0,
      SKELETON_SELECTOR,
      { timeout: SKELETON_TIMEOUT_MS }
    )
    .catch(() => undefined);
  return wentIdle;
}

export const countSkeletons = (page: Page) =>
  page.locator(SKELETON_SELECTOR).count();

/** Client-side navigation: TanStack Router patches `history.pushState`, so this runs loaders without a document load. */
export async function clientNavigate(page: Page, url: string) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
  }, url);
}

export interface Visit {
  route: string;
  project: string;
  url: string | null;
  finalUrl?: string;
  status?: number | null;
  loadMs?: number;
  wentIdle?: boolean;
  state?: PageState;
  consoleErrors?: string[];
  consoleWarnings?: string[];
  pageErrors?: string[];
  badResponses?: BadResponse[];
  failedRequests?: string[];
  screenshot?: string;
  navigationError?: string;
  hydrateMs?: number;
  hydrated?: boolean;
  attempts?: number;
  skeletonsLeft?: number;
}

const MAX_LOAD_ATTEMPTS = 3;

/**
 * The dev server answers 502 for some of its ~1200 modules when the machine is
 * saturated; the client entry then never runs. That is not an app defect, so a
 * visit that never hydrated is loaded again before it is recorded.
 */
export async function visit(
  page: Page,
  recorder: Recorder,
  label: { route: string; project: string },
  url: string,
  screenshotPath?: string
): Promise<Visit> {
  const result: Visit = { ...label, url };
  for (let attempt = 1; attempt <= MAX_LOAD_ATTEMPTS; attempt++) {
    recorder.reset();
    const startedAt = Date.now();
    delete result.navigationError;
    result.attempts = attempt;
    try {
      const response = await page.goto(url, { waitUntil: 'load' });
      result.status = response?.status() ?? null;
      result.hydrated = await waitForHydration(page);
      result.hydrateMs = Date.now() - startedAt;
      if (!result.hydrated && attempt < MAX_LOAD_ATTEMPTS) {
        continue;
      }
      result.wentIdle = await settle(page);
      result.skeletonsLeft = await countSkeletons(page);
      result.loadMs = Date.now() - startedAt;
      result.finalUrl =
        new URL(page.url()).pathname + new URL(page.url()).search;
      result.state = await inspectPage(page);
      if (screenshotPath) {
        mkdirSync(dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = screenshotPath;
      }
      break;
    } catch (error) {
      result.navigationError = String(error).slice(0, 500);
    }
  }
  Object.assign(result, recorder.snapshot());
  logProgress(result);
  return result;
}

/** Same record as `visit`, reached by client-side navigation from an already hydrated page. */
export async function visitClientSide(
  page: Page,
  recorder: Recorder,
  label: { route: string; project: string },
  url: string,
  screenshotPath?: string
): Promise<Visit> {
  recorder.reset();
  const startedAt = Date.now();
  const result: Visit = { ...label, url };
  try {
    await clientNavigate(page, url);
    // Loaders and queries start a tick after the history change; without this
    // pause `networkidle` resolves against the previous page.
    await page.waitForTimeout(CLIENT_NAVIGATION_START_MS);
    result.wentIdle = await settle(page);
    result.skeletonsLeft = await countSkeletons(page);
    result.loadMs = Date.now() - startedAt;
    result.finalUrl = new URL(page.url()).pathname + new URL(page.url()).search;
    result.state = await inspectPage(page);
    if (screenshotPath) {
      mkdirSync(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshot = screenshotPath;
    }
  } catch (error) {
    result.navigationError = String(error).slice(0, 500);
  }
  Object.assign(result, recorder.snapshot());
  logProgress(result);
  return result;
}

/** One line per visit on stdout, so a long sweep shows where it is. */
export function logProgress(result: Visit) {
  process.stdout.write(
    `${result.project} ${result.route} -> ${result.finalUrl ?? result.navigationError} ${result.loadMs ?? '?'}ms skeletons=${result.skeletonsLeft ?? '?'}\n`
  );
}

export function isClean(result: Visit): boolean {
  return (
    !result.navigationError &&
    (result.status ?? 0) < 400 &&
    !result.pageErrors?.length &&
    !result.consoleErrors?.length &&
    !result.badResponses?.length &&
    !result.state?.isBlank &&
    !result.state?.suspicious.length
  );
}

export function writeJson(name: string, data: unknown) {
  const file = resolve(OUTPUT_DIR, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export const slug = (route: string) =>
  route
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'root';
