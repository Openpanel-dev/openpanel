import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { ARCHETYPES } from './archetypes';
import type {
  ClickhouseEventRow,
  ClickhouseProfileRow,
  ClickhouseSessionRow,
} from './clickhouse-rows';
import { type GenerateConfig, generate, planDays } from './generator';
import { projectIdFor } from './ids';
import type { RowSink, SinkCounts } from './sink';

class MemorySink implements RowSink {
  events: ClickhouseEventRow[] = [];
  sessions: ClickhouseSessionRow[] = [];
  profiles: ClickhouseProfileRow[] = [];

  addEvents(rows: readonly ClickhouseEventRow[]): void {
    this.events.push(...rows);
  }
  addSession(row: ClickhouseSessionRow): void {
    this.sessions.push(row);
  }
  addProfiles(rows: readonly ClickhouseProfileRow[]): void {
    this.profiles.push(...rows);
  }
  flushFull(): Promise<void> {
    return Promise.resolve();
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
  counts(): SinkCounts {
    return {
      events: this.events.length,
      sessions: this.sessions.length,
      profiles: this.profiles.length,
    };
  }
}

const NOW = new Date('2026-09-20T12:00:00.000Z');
const ignoreProgress = () => undefined;

function config(overrides: Partial<GenerateConfig> = {}): GenerateConfig {
  return {
    seed: 7,
    sessionsPerDay: 200,
    days: 3,
    now: NOW,
    variance: 1,
    projects: ARCHETYPES.map((archetype) => ({
      archetype,
      projectId: projectIdFor(archetype),
    })),
    ...overrides,
  };
}

async function run(
  overrides: Partial<GenerateConfig> = {}
): Promise<MemorySink> {
  const sink = new MemorySink();
  await generate(config(overrides), sink, ignoreProgress);
  return sink;
}

/** `inserted_at` is stamped at insert time by design; everything else must be reproducible. */
function fingerprint(sink: MemorySink): string {
  const hash = createHash('sha256');
  for (const event of sink.events) {
    hash.update(JSON.stringify({ ...event, inserted_at: undefined }));
  }
  for (const session of sink.sessions) {
    hash.update(JSON.stringify(session));
  }
  for (const profile of sink.profiles) {
    hash.update(JSON.stringify(profile));
  }
  return hash.digest('hex');
}

describe('generate', () => {
  test('is deterministic for a seed and differs across seeds', async () => {
    const [first, second, other] = await Promise.all([
      run(),
      run(),
      run({ seed: 8 }),
    ]);
    expect(first.events.length).toBeGreaterThan(0);
    expect(fingerprint(first)).toBe(fingerprint(second));
    expect(fingerprint(other)).not.toBe(fingerprint(first));
  });

  test('plans roughly the requested volume', () => {
    const planned = planDays(config()).reduce(
      (sum, day) => sum + day.sessions,
      0
    );
    expect(planned).toBeGreaterThan(200 * 3 * 0.4);
    expect(planned).toBeLessThan(200 * 3 * 2.5);
  });

  test('every session has one session_start, one session_end and a matching sessions row', async () => {
    const sink = await run();
    const bySession = new Map<string, ClickhouseEventRow[]>();
    for (const event of sink.events) {
      const list = bySession.get(event.session_id) ?? [];
      list.push(event);
      bySession.set(event.session_id, list);
    }
    expect(bySession.size).toBe(sink.sessions.length);

    for (const session of sink.sessions) {
      const events = bySession.get(session.id);
      expect(events).toBeDefined();
      if (!events) {
        continue;
      }
      const names = events.map((event) => event.name);
      expect(names.filter((name) => name === 'session_start')).toHaveLength(1);
      expect(names.filter((name) => name === 'session_end')).toHaveLength(1);
      expect(session.sign).toBe(1);
      expect(session.screen_view_count + session.event_count).toBe(
        events.length - 2
      );
      expect(session.is_bounce).toBe(session.screen_view_count <= 1);
      expect(session.duration).toBeGreaterThanOrEqual(0);
      for (const event of events) {
        expect(event.project_id).toBe(session.project_id);
        expect(event.device_id).toBe(session.device_id);
        expect(event.profile_id).not.toBe('');
      }
      const end = events.find((event) => event.name === 'session_end');
      expect(end?.properties.__bounce).toBe(String(session.is_bounce));
      expect(end?.duration).toBe(session.duration);
    }
  });

  test('events are ordered within a session and never in the future', async () => {
    const sink = await run();
    for (const event of sink.events) {
      expect(new Date(`${event.created_at}Z`).getTime()).toBeLessThanOrEqual(
        NOW.getTime() + 1000
      );
    }
  });

  test('profiles cover every profile_id the events reference, once each', async () => {
    const sink = await run();
    const referenced = new Set(
      sink.events.map((event) => `${event.project_id}/${event.profile_id}`)
    );
    const written = sink.profiles.map(
      (profile) => `${profile.project_id}/${profile.id}`
    );
    expect(new Set(written).size).toBe(written.length);
    for (const key of referenced) {
      expect(written).toContain(key);
    }
    const identified = sink.profiles.filter((profile) => profile.is_external);
    expect(identified.length).toBeGreaterThan(0);
    for (const profile of identified) {
      expect(profile.email).toContain('@');
    }
  });

  test('device and referrer fields come from the real parsers', async () => {
    const sink = await run();
    const devices = new Set(sink.events.map((event) => event.device));
    expect(
      [...devices].every((device) =>
        ['desktop', 'mobile', 'tablet'].includes(device)
      )
    ).toBe(true);
    const referrerTypes = new Set(
      sink.sessions.map((session) => session.referrer_type)
    );
    expect(referrerTypes.has('search')).toBe(true);
    expect(referrerTypes.has('social')).toBe(true);
    const withUtm = sink.sessions.filter(
      (session) => session.utm_source !== ''
    );
    expect(withUtm.length).toBeGreaterThan(0);
  });
});

const MS_PER_DAY = 86_400_000;

function dayOf(event: ClickhouseEventRow): string {
  return event.created_at.slice(0, 10);
}

function eventsOf(
  sink: MemorySink,
  projectId: string,
  name?: string
): ClickhouseEventRow[] {
  return sink.events.filter(
    (event) =>
      event.project_id === projectId &&
      (name === undefined || event.name === name)
  );
}

describe('identity and retention', () => {
  test('anonymous devices are recognised within a UTC day and never across days', async () => {
    const sink = await run({ days: 10 });
    const daysPerDevice = new Map<string, Set<string>>();
    const sessionsPerDevice = new Map<string, Set<string>>();
    for (const event of eventsOf(sink, 'acme-web')) {
      if (event.profile_id !== event.device_id) {
        continue;
      }
      daysPerDevice.set(
        event.device_id,
        (daysPerDevice.get(event.device_id) ?? new Set()).add(dayOf(event))
      );
      sessionsPerDevice.set(
        event.device_id,
        (sessionsPerDevice.get(event.device_id) ?? new Set()).add(
          event.session_id
        )
      );
    }
    expect(daysPerDevice.size).toBeGreaterThan(100);
    for (const days of daysPerDevice.values()) {
      expect(days.size).toBe(1);
    }
    const sameDayReturns = [...sessionsPerDevice.values()].filter(
      (sessions) => sessions.size >= 2
    ).length;
    expect(sameDayReturns).toBeGreaterThan(10);
  });

  test('identified users keep their profile across days, so retention exists', async () => {
    const sink = await run({ days: 14, sessionsPerDay: 300 });
    for (const projectId of ['acme-saas', 'acme-app']) {
      const firstDay = new Map<string, number>();
      const activeDays = new Map<string, Set<number>>();
      for (const event of eventsOf(sink, projectId)) {
        if (event.profile_id === event.device_id) {
          continue;
        }
        const day = Math.floor(
          new Date(`${event.created_at}Z`).getTime() / MS_PER_DAY
        );
        firstDay.set(
          event.profile_id,
          Math.min(firstDay.get(event.profile_id) ?? day, day)
        );
        activeDays.set(
          event.profile_id,
          (activeDays.get(event.profile_id) ?? new Set()).add(day)
        );
      }
      // Cohorts old enough to have a day-7: those who started in the first 5 days.
      const cutoff = Math.min(...firstDay.values()) + 5;
      const cohort = [...firstDay].filter(([, day]) => day <= cutoff);
      const retainedDay7 = cohort.filter(([id, day]) =>
        activeDays.get(id)?.has(day + 7)
      ).length;
      expect(cohort.length).toBeGreaterThan(50);
      expect(retainedDay7 / cohort.length).toBeGreaterThan(0.1);
    }
  });

  test('a device that identifies mid-session leaves both an anonymous and a person profile', async () => {
    const sink = await run({ days: 5 });
    const signups = eventsOf(sink, 'acme-web', 'signup_completed');
    expect(signups.length).toBeGreaterThan(0);
    const profileIds = new Set(
      sink.profiles
        .filter((profile) => profile.project_id === 'acme-web')
        .map((profile) => profile.id)
    );
    for (const signup of signups) {
      expect(signup.profile_id).not.toBe(signup.device_id);
      expect(profileIds.has(signup.profile_id)).toBe(true);
      expect(profileIds.has(signup.device_id)).toBe(true);
    }
  });
});

describe('funnels', () => {
  /** Within-session funnels link by session; the SaaS activation funnel spans visits, so by person. */
  const FUNNELS: Record<
    string,
    { by: 'session_id' | 'profile_id'; steps: string[] }
  > = {
    'acme-shop': {
      by: 'session_id',
      steps: [
        'product_viewed',
        'add_to_cart',
        'checkout_started',
        'shipping_info_added',
        'payment_info_added',
        'purchase',
      ],
    },
    'acme-saas': {
      by: 'profile_id',
      steps: [
        'signup_completed',
        'project_created',
        'sdk_installed',
        'first_event_received',
      ],
    },
    'acme-app': {
      by: 'profile_id',
      steps: [
        'app_opened',
        'signup_completed',
        'notification_permission',
        'post_created',
      ],
    },
    'acme-web': {
      by: 'session_id',
      steps: [
        'screen_view',
        'plan_selected',
        'signup_started',
        'signup_completed',
      ],
    },
  };

  test('each step is reached by fewer users than the one before, and the last by some', async () => {
    const sink = await run({ days: 10, sessionsPerDay: 300 });
    for (const [projectId, { by, steps }] of Object.entries(FUNNELS)) {
      // Funnel semantics: a user counts for a step only having done every step before it.
      let reached: Set<string> | null = null;
      const counts: number[] = [];
      for (const step of steps) {
        const users = new Set(
          eventsOf(sink, projectId, step).map((event) => event[by])
        );
        const previous: Set<string> = reached ?? users;
        reached = new Set([...previous].filter((user) => users.has(user)));
        counts.push(reached.size);
      }
      expect(counts.at(-1)).toBeGreaterThan(0);
      expect(counts.at(-1)).toBeLessThan(counts[0] ?? 0);
    }
  });

  test('purchases carry breakdown-worthy properties and revenue', async () => {
    const sink = await run({ days: 10, sessionsPerDay: 300 });
    const purchases = eventsOf(sink, 'acme-shop', 'purchase');
    expect(purchases.length).toBeGreaterThan(5);
    const payments = new Set(
      purchases.map((event) => event.properties.payment)
    );
    expect(payments.size).toBeGreaterThan(1);
    expect(
      purchases.every((event) => event.properties.order_id?.startsWith('ord_'))
    ).toBe(true);
    const revenue = eventsOf(sink, 'acme-shop', 'revenue');
    expect(revenue.length).toBe(purchases.length);
    expect(
      revenue.every(
        (event) => Number.isInteger(event.revenue) && (event.revenue ?? 0) > 0
      )
    ).toBe(true);
  });
});
