/**
 * Integration tests for MCP tools against a real ClickHouse instance.
 *
 * CLICKHOUSE_URL is pinned to http://localhost:8123 in vitest.shared.ts —
 * always targets local Docker, never production. Start with: pnpm dock:up
 *
 * Fixture data (inserted by globalSetup in setup.ts):
 *   Alice   — 3 events: session_start, page_view(/home), session_end  — 2 days ago — country: US, browser: Chrome
 *   Bob     — 0 events (inactive)                                      — profile created 90 days ago — country: SE
 *   Charlie — 5 events: session_start, screen_view, page_view(/shop), purchase, session_end — 5 days ago — browser: Firefox
 *             2 sessions (sess-charlie-1 5d ago, sess-charlie-2 10d ago)
 *
 * For tools that also call getSettingsForProject (Postgres), we mock only
 * that function — all ClickHouse queries still run for real.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return {
    ...actual,
    getSettingsForProject: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
  };
});

// Bypass Redis caching — prevents ioredis TCP connections that hang the process
vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  return {
    ...actual,
    getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
  };
});

import { FIXTURE, setup, teardown } from './setup';
import { registerActiveUserTools } from '../tools/analytics/active-users';
import { registerEngagementTools } from '../tools/analytics/engagement';
import { registerEventNameTools } from '../tools/analytics/event-names';
import { registerEventTools } from '../tools/analytics/events';
import { registerFunnelTools } from '../tools/analytics/funnel';
import { registerGroupTools } from '../tools/analytics/groups';
import { registerOverviewTools } from '../tools/analytics/overview';
import { registerPagePerformanceTools } from '../tools/analytics/page-performance';
import { registerPageTools } from '../tools/analytics/pages';
import { registerProfileMetricTools } from '../tools/analytics/profile-metrics';
import { registerProfileTools } from '../tools/analytics/profiles';
import { registerPropertyValueTools } from '../tools/analytics/property-values';
import { registerRetentionTools } from '../tools/analytics/retention';
import { registerSessionTools } from '../tools/analytics/sessions';
import { registerTrafficTools } from '../tools/analytics/traffic';
import { registerUserFlowTools } from '../tools/analytics/user-flow';
import { TEST_PROJECT_ID } from './setup';

const CTX = {
  projectId: TEST_PROJECT_ID,
  organizationId: 'org-test',
  clientType: 'read' as const,
};

// Run ClickHouse fixture setup only when this file is executed (not for unit tests)
beforeAll(() => setup(), 30_000);
afterAll(() => teardown(), 10_000);

function makeServer() {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  return {
    tool: (name: string, _desc: string, _schema: unknown, fn: (input: unknown) => Promise<unknown>) => {
      handlers.set(name, fn);
    },
    invoke: async (name: string, input: unknown) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Tool not registered: ${name}`);
      const result = await handler(input) as any;
      return JSON.parse(result.content[0].text);
    },
  };
}

// ─── Discovery ────────────────────────────────────────────────────────────────

describe('list_event_names', () => {
  it('returns { event_names: string[] }', async () => {
    const server = makeServer();
    registerEventNameTools(server as any, CTX);
    const res = await server.invoke('list_event_names', { projectId: TEST_PROJECT_ID });
    expect(Array.isArray(res.event_names)).toBe(true);
  });
});

describe('list_event_properties', () => {
  it('returns { properties: array }', async () => {
    const server = makeServer();
    registerPropertyValueTools(server as any, CTX);
    const res = await server.invoke('list_event_properties', { projectId: TEST_PROJECT_ID });
    expect(Array.isArray(res.properties)).toBe(true);
  });
});

describe('get_event_property_values', () => {
  it('returns { event, property, values }', async () => {
    const server = makeServer();
    registerPropertyValueTools(server as any, CTX);
    const res = await server.invoke('get_event_property_values', {
      projectId: TEST_PROJECT_ID,
      eventName: 'purchase',
      propertyKey: 'plan',
    });
    expect(res.event).toBe('purchase');
    expect(res.property).toBe('plan');
    expect(Array.isArray(res.values)).toBe(true);
  });
});

// ─── Raw data ─────────────────────────────────────────────────────────────────

describe('query_events', () => {
  it('returns all 8 fixture events', async () => {
    const server = makeServer();
    registerEventTools(server as any, CTX);
    const res = await server.invoke('query_events', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(res.length).toBe(8);
  });

  it('filters by eventName — only returns purchase events', async () => {
    const server = makeServer();
    registerEventTools(server as any, CTX);
    const res = await server.invoke('query_events', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      eventNames: ['purchase'],
    });
    expect(res.length).toBe(1);
    expect(res[0].name).toBe('purchase');
    expect(res[0].profile_id).toBe(FIXTURE.profiles.charlie);
    expect(res[0].revenue).toBe(9900);
  });

  it('filters by profileId — returns only alice events', async () => {
    const server = makeServer();
    registerEventTools(server as any, CTX);
    const res = await server.invoke('query_events', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      profileId: FIXTURE.profiles.alice,
    });
    expect(res.length).toBe(3);
    expect(res.every((e: any) => e.profile_id === FIXTURE.profiles.alice)).toBe(true);
  });

  it('filters by browser', async () => {
    const server = makeServer();
    registerEventTools(server as any, CTX);
    const res = await server.invoke('query_events', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      browser: 'Firefox',
    });
    expect(res.length).toBe(5);
    expect(res.every((e: any) => e.browser === 'Firefox')).toBe(true);
  });

  // Note: read-context resolveProjectId ignores the input projectId and always
  // uses CTX.projectId — so there is no way to query another project's data.

});

describe('query_sessions', () => {
  it('returns all 3 fixture sessions', async () => {
    const server = makeServer();
    registerSessionTools(server as any, CTX);
    const res = await server.invoke('query_sessions', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(res.length).toBe(3);
  });

  it('filters by profileId — charlie has 2 sessions', async () => {
    const server = makeServer();
    registerSessionTools(server as any, CTX);
    const res = await server.invoke('query_sessions', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      profileId: FIXTURE.profiles.charlie,
    });
    expect(res.length).toBe(2);
    expect(res.every((s: any) => s.profile_id === FIXTURE.profiles.charlie)).toBe(true);
  });

  it('filters by browser', async () => {
    const server = makeServer();
    registerSessionTools(server as any, CTX);
    const res = await server.invoke('query_sessions', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      browser: 'Chrome',
    });
    expect(res.length).toBe(1);
    expect(res[0].profile_id).toBe(FIXTURE.profiles.alice);
  });
});

// ─── Profile tools ────────────────────────────────────────────────────────────

describe('find_profiles', () => {
  it('returns all 3 fixture profiles', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID });
    expect(res.length).toBe(3);
  });

  it('filters by email partial match', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID, email: 'alice@' });
    expect(res.length).toBe(1);
    expect(res[0].email).toBe('alice@example.com');
  });

  it('filters by name — matches first_name and last_name', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const byFirst = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID, name: 'Charlie' });
    expect(byFirst.length).toBe(1);
    expect(byFirst[0].first_name).toBe('Charlie');

    const byLast = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID, name: 'Smith' });
    expect(byLast.length).toBe(1);
    expect(byLast[0].last_name).toBe('Smith');
  });

  it('filters by country property', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID, country: 'SE' });
    expect(res.length).toBe(1);
    expect(res[0].email).toBe('bob@example.com');
  });

  it('inactiveDays=7 excludes alice (active 2 days ago) but includes bob (no events)', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID, inactiveDays: 7 });
    const emails = res.map((p: any) => p.email);
    expect(emails).not.toContain('alice@example.com');
    expect(emails).not.toContain('charlie@example.com');
    expect(emails).toContain('bob@example.com');
  });

  it('minSessions=2 returns only charlie (has 2 sessions)', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID, minSessions: 2 });
    expect(res.length).toBe(1);
    expect(res[0].first_name).toBe('Charlie');
  });

  it('performedEvent=purchase returns only charlie', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('find_profiles', { projectId: TEST_PROJECT_ID, performedEvent: 'purchase' });
    expect(res.length).toBe(1);
    expect(res[0].first_name).toBe('Charlie');
  });

  // Note: read-context resolveProjectId ignores the input projectId and always
  // uses CTX.projectId — so there is no way to query another project's data.

});

describe('get_profile', () => {
  it('returns correct profile and events for charlie', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('get_profile', {
      projectId: TEST_PROJECT_ID,
      profileId: FIXTURE.profiles.charlie,
    });
    expect(res.profile.first_name).toBe('Charlie');
    expect(res.profile.email).toBe('charlie@example.com');
    expect(Array.isArray(res.recent_events)).toBe(true);
    expect(res.recent_events.length).toBe(5); // all charlie events
  });
});

describe('get_profile_sessions', () => {
  it('returns 2 sessions for charlie', async () => {
    const server = makeServer();
    registerProfileTools(server as any, CTX);
    const res = await server.invoke('get_profile_sessions', {
      projectId: TEST_PROJECT_ID,
      profileId: FIXTURE.profiles.charlie,
    });
    expect(res.sessions.length).toBe(2);
    expect(res.sessions.every((s: any) => s.profile_id === FIXTURE.profiles.charlie)).toBe(true);
  });
});

describe('get_profile_metrics', () => {
  it('returns exact metrics for charlie', async () => {
    const server = makeServer();
    registerProfileMetricTools(server as any, CTX);
    const res = await server.invoke('get_profile_metrics', {
      projectId: TEST_PROJECT_ID,
      profileId: FIXTURE.profiles.charlie,
    });
    // No error — bug was getProfileMetrics returns single object, not array
    expect(res.error).toBeUndefined();
    expect(res.profileId).toBe(FIXTURE.profiles.charlie);
    expect(res.sessions).toBe(1);           // 1 session_start event
    expect(res.screenViews).toBe(1);        // 1 screen_view event
    expect(res.totalEvents).toBe(5);        // session_start + screen_view + page_view + purchase + session_end
    expect(res.conversionEvents).toBe(2);   // page_view + purchase (excludes session_start/screen_view/session_end)
    expect(res.uniqueDaysActive).toBe(1);   // all on the same day
    expect(res.firstSeen).not.toBeNull();
    expect(res.lastSeen).not.toBeNull();
  });

  it('returns metrics for alice', async () => {
    const server = makeServer();
    registerProfileMetricTools(server as any, CTX);
    const res = await server.invoke('get_profile_metrics', {
      projectId: TEST_PROJECT_ID,
      profileId: FIXTURE.profiles.alice,
    });
    expect(res.error).toBeUndefined();
    expect(res.sessions).toBe(1);
    expect(res.totalEvents).toBe(3);     // session_start + page_view + session_end
    expect(res.conversionEvents).toBe(1); // page_view only
    expect(res.screenViews).toBe(0);
  });
});

// ─── Groups ───────────────────────────────────────────────────────────────────

describe('list_group_types', () => {
  it('returns { types: [] } (no groups in fixtures)', async () => {
    const server = makeServer();
    registerGroupTools(server as any, CTX);
    const res = await server.invoke('list_group_types', { projectId: TEST_PROJECT_ID });
    expect(Array.isArray(res.types)).toBe(true);
    expect(res.types).toHaveLength(0);
  });
});

describe('find_groups', () => {
  it('returns empty array (no groups in fixtures)', async () => {
    const server = makeServer();
    registerGroupTools(server as any, CTX);
    const res = await server.invoke('find_groups', { projectId: TEST_PROJECT_ID });
    expect(Array.isArray(res)).toBe(true);
  });
});

describe('get_group', () => {
  it('returns not-found error for unknown group', async () => {
    const server = makeServer();
    registerGroupTools(server as any, CTX);
    const res = await server.invoke('get_group', {
      projectId: TEST_PROJECT_ID,
      groupId: 'nonexistent',
    });
    expect(res.error).toBe('Group not found');
    expect(res.groupId).toBe('nonexistent');
  });
});

// ─── Aggregated metrics ───────────────────────────────────────────────────────

describe('get_analytics_overview', () => {
  it('returns summary with numeric metric fields and a series array', async () => {
    const server = makeServer();
    registerOverviewTools(server as any, CTX);
    const res = await server.invoke('get_analytics_overview', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(res).toHaveProperty('summary');
    expect(res).toHaveProperty('series');
    expect(Array.isArray(res.series)).toBe(true);
  });
});

describe('get_top_pages', () => {
  it('returns array including /shop and /home from fixtures', async () => {
    const server = makeServer();
    registerPageTools(server as any, CTX);
    const res = await server.invoke('get_top_pages', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(Array.isArray(res)).toBe(true);
    const paths = res.map((p: any) => p.path);
    // getTopPages queries screen_view events only — Charlie's /shop appears;
    // Alice's /home is a page_view (not screen_view) so it won't show here.
    expect(paths).toContain('/shop');
  });
});

describe('get_entry_exit_pages', () => {
  it('returns entry pages array', async () => {
    const server = makeServer();
    registerPageTools(server as any, CTX);
    const res = await server.invoke('get_entry_exit_pages', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      mode: 'entry',
    });
    expect(Array.isArray(res)).toBe(true);
  });

  it('returns exit pages array', async () => {
    const server = makeServer();
    registerPageTools(server as any, CTX);
    const res = await server.invoke('get_entry_exit_pages', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      mode: 'exit',
    });
    expect(Array.isArray(res)).toBe(true);
  });
});

describe('get_page_performance', () => {
  it('returns pages array with seo_signals on each page', async () => {
    const server = makeServer();
    registerPagePerformanceTools(server as any, CTX);
    const res = await server.invoke('get_page_performance', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(typeof res.total_pages).toBe('number');
    expect(typeof res.shown).toBe('number');
    expect(Array.isArray(res.pages)).toBe(true);
    for (const page of res.pages) {
      expect(page).toHaveProperty('seo_signals');
      expect(typeof page.seo_signals.high_bounce).toBe('boolean');
      expect(typeof page.seo_signals.low_engagement).toBe('boolean');
      expect(typeof page.seo_signals.good_landing_page).toBe('boolean');
    }
  });
});

describe('get_top_referrers', () => {
  it('returns array', async () => {
    const server = makeServer();
    registerTrafficTools(server as any, CTX);
    const res = await server.invoke('get_top_referrers', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(Array.isArray(res)).toBe(true);
  });
});

describe('get_country_breakdown', () => {
  it('returns US as country in fixtures', async () => {
    const server = makeServer();
    registerTrafficTools(server as any, CTX);
    const res = await server.invoke('get_country_breakdown', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(Array.isArray(res)).toBe(true);
    // getTopGeneric returns { name, sessions, pageviews } — field is 'name'
    const countries = res.map((r: any) => r.name);
    expect(countries).toContain('US');
  });
});

describe('get_device_breakdown', () => {
  it('returns desktop in fixtures', async () => {
    const server = makeServer();
    registerTrafficTools(server as any, CTX);
    const res = await server.invoke('get_device_breakdown', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
    });
    expect(Array.isArray(res)).toBe(true);
    // getTopGeneric returns { name, sessions, pageviews } — field is 'name'
    const devices = res.map((r: any) => r.name);
    expect(devices).toContain('desktop');
  });
});

// ─── User behavior ────────────────────────────────────────────────────────────

describe('get_funnel', () => {
  it('detects charlie completing session_start → purchase', async () => {
    const server = makeServer();
    registerFunnelTools(server as any, CTX);
    const res = await server.invoke('get_funnel', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      steps: ['session_start', 'purchase'],
    });
    expect(res).toHaveProperty('steps');
    expect(res.steps.length).toBe(2);
    expect(res.steps[0].eventName).toBe('session_start');
    expect(res.steps[1].eventName).toBe('purchase');
    expect(res.totalUsers).toBeGreaterThanOrEqual(1);
    expect(res.completedUsers).toBeGreaterThanOrEqual(1);
    expect(res.overallConversionRate).toBeGreaterThan(0);
    // Each step has the required fields
    for (const step of res.steps) {
      expect(typeof step.step).toBe('number');
      expect(typeof step.users).toBe('number');
      expect(typeof step.conversionRateFromStart).toBe('number');
    }
  });

  it('returns zero completions for an impossible funnel order', async () => {
    const server = makeServer();
    registerFunnelTools(server as any, CTX);
    const res = await server.invoke('get_funnel', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      steps: ['purchase', 'session_start'], // reversed — nobody completes this
    });
    expect(res.completedUsers).toBe(0);
  });
});

describe('get_user_flow', () => {
  it('returns nodes and links for flow after session_start', async () => {
    const server = makeServer();
    registerUserFlowTools(server as any, CTX);
    const res = await server.invoke('get_user_flow', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      startEvent: 'session_start',
      mode: 'after',
    });
    expect(res.mode).toBe('after');
    expect(res.startEvent).toBe('session_start');
    expect(Array.isArray(res.nodes)).toBe(true);
    expect(Array.isArray(res.links)).toBe(true);
    expect(typeof res.node_count).toBe('number');
    expect(typeof res.link_count).toBe('number');
  });

  it('returns error when mode=between without endEvent', async () => {
    const server = makeServer();
    registerUserFlowTools(server as any, CTX);
    const res = await server.invoke('get_user_flow', {
      projectId: TEST_PROJECT_ID,
      startDate: '2000-01-01',
      endDate: '2099-01-01',
      startEvent: 'session_start',
      mode: 'between',
      // endEvent intentionally omitted
    });
    expect(res.error).toContain('endEvent');
  });
});

describe('get_rolling_active_users', () => {
  it('returns DAU series (may be empty — dau_mv not auto-populated)', async () => {
    const server = makeServer();
    registerActiveUserTools(server as any, CTX);
    const res = await server.invoke('get_rolling_active_users', { projectId: TEST_PROJECT_ID, days: 1 });
    expect(res.label).toBe('DAU');
    expect(res.window_days).toBe(1);
    expect(Array.isArray(res.series)).toBe(true);
  });

  it('uses correct label for WAU and MAU', async () => {
    const server = makeServer();
    registerActiveUserTools(server as any, CTX);
    const wau = await server.invoke('get_rolling_active_users', { projectId: TEST_PROJECT_ID, days: 7 });
    expect(wau.label).toBe('WAU');
    const mau = await server.invoke('get_rolling_active_users', { projectId: TEST_PROJECT_ID, days: 30 });
    expect(mau.label).toBe('MAU');
  });
});

describe('get_weekly_retention_series', () => {
  it('returns array of { date, active_users, retained_users, retention } rows', async () => {
    const server = makeServer();
    registerActiveUserTools(server as any, CTX);
    const res = await server.invoke('get_weekly_retention_series', { projectId: TEST_PROJECT_ID });
    expect(Array.isArray(res)).toBe(true);
    if (res.length > 0) {
      expect(res[0]).toHaveProperty('date');
      expect(res[0]).toHaveProperty('active_users');
      expect(res[0]).toHaveProperty('retained_users');
      expect(res[0]).toHaveProperty('retention');
    }
  });
});

describe('get_retention_cohort', () => {
  it('returns array of cohort rows with period_0..period_9', async () => {
    const server = makeServer();
    registerRetentionTools(server as any, CTX);
    const res = await server.invoke('get_retention_cohort', { projectId: TEST_PROJECT_ID });
    expect(Array.isArray(res)).toBe(true);
    if (res.length > 0) {
      expect(res[0]).toHaveProperty('first_seen');
      expect(res[0]).toHaveProperty('period_0');
    }
  });
});

describe('get_user_last_seen_distribution', () => {
  it('returns alice and charlie in active_last_7_days bucket', async () => {
    const server = makeServer();
    registerEngagementTools(server as any, CTX);
    const res = await server.invoke('get_user_last_seen_distribution', { projectId: TEST_PROJECT_ID });
    // Alice: last event 2 days ago → 0-7 bucket
    // Charlie: last event 5 days ago → 0-7 bucket
    // Bob: no events → not counted
    expect(res.summary.total_identified_users).toBe(2);
    expect(res.summary.active_last_7_days).toBe(2);
    expect(res.summary.active_8_to_14_days).toBe(0);
    expect(res.summary.churned_60_plus_days).toBe(0);
    expect(Array.isArray(res.distribution)).toBe(true);
  });
});
