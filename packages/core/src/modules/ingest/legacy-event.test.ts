/**
 * Tests for the legacy `POST /event` compat route (ADR-015 entry 1, reversed:
 * the route is KEPT, produces to Kafka exactly like /track, and is measured
 * per client so the deferred removal decision has data).
 *
 * Ported from apps/api/src/controllers/event.controller.test.ts with M9-004,
 * when the controller and its usage hook moved into this module. The producer
 * is an argument now, so V1's `vi.mock` of @openpanel/queue becomes a plain
 * stub, and the counter lives on core's one registry rather than prom-client's
 * global one — same assertions.
 *
 * The `mixan-*` header fallback moved with the validator itself (M8-002) — see
 * `src/client-auth.test.ts`.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import type { Buffers } from '../../buffers/create-buffers';
import type { GeoLocation } from '../../clients/geo';
import type { DeprecatedPostEventPayload } from './ingest.constants';
import type { IncomingEventPayload } from './src/incoming-event';
import {
  legacyEventRequestsTotal,
  recordLegacyEventRequest,
} from './src/ingest.metrics';

const PROJECT_ID = 'legacy-event-project';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const getGeoLocation = mock(
  async (): Promise<GeoLocation> => ({
    country: 'SE',
    city: 'Stockholm',
    region: 'AB',
    longitude: 18,
    latitude: 59,
  })
);
const getAsnInfo = mock(async () => ({
  asn: 1234,
  org: 'Example ISP',
  isHosting: false,
}));
const getSalts = mock(async () => ({
  current: 'salt-current',
  previous: 'salt-previous',
}));

mock.module('../../clients/geo', () => ({ getGeoLocation, getAsnInfo }));

let ingestLegacyEvent: typeof import('./ingest.service').ingestLegacyEvent;

// M10-004: ingest.service.ts reaches `getSalts` through the v1-compat
// singleton now (salt.service.ts's own cache moved inside
// `createSaltService(deps)` — see both files' headers), so that's the
// specifier mocked here, spread-actual like everywhere else this seam is
// overridden.
let realV1Compat: typeof import('../../v1-compat');
beforeAll(async () => {
  realV1Compat = { ...(await import('../../v1-compat')) };
  mock.module('../../v1-compat', () => ({ ...realV1Compat, getSalts }));
  ({ ingestLegacyEvent } = await import('./ingest.service'));
});

afterAll(() => {
  mock.module('../../v1-compat', () => realV1Compat);
});

const produced: { payload: IncomingEventPayload; partitionKey: string }[] = [];
const produceIncomingEvent = async (
  payload: IncomingEventPayload,
  partitionKey: string
) => {
  produced.push({ payload, partitionKey });
};

// The legacy route resolves a device id, which is the only buffer read on
// this path (`getExistingSession`, once per salt candidate).
const buffers = {
  session: { getExistingSession: async () => null },
  replay: {},
  group: {},
} as unknown as Buffers;

const legacyBody = (
  overrides: Partial<DeprecatedPostEventPayload> = {}
): DeprecatedPostEventPayload => ({
  name: 'legacy_event',
  timestamp: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  properties: { __referrer: '', foo: 'bar' },
  ...overrides,
});

const requestTimestamp = Date.now();

const makeRequest = (projectId: string | null = PROJECT_ID) => ({
  projectId,
  clientIp: '203.0.113.10',
  headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)' },
  clientSecretAuth: false,
  timestamp: requestTimestamp,
  body: legacyBody(),
});

const counterValue = async (clientId: string) => {
  const { values } = await legacyEventRequestsTotal.get();
  return (
    values.find((value) => value.labels.client_id === clientId)?.value ?? 0
  );
};

beforeEach(() => {
  produced.length = 0;
});

describe('ingestLegacyEvent', () => {
  it('produces the legacy payload to Kafka and reports ok', async () => {
    const outcome = await ingestLegacyEvent(makeRequest(), {
      buffers,
      produceIncomingEvent,
    });

    expect(outcome.status).toBe('ok');
    expect(produced).toHaveLength(1);
    const { payload, partitionKey } = produced[0]!;

    expect(payload.projectId).toBe(PROJECT_ID);
    expect(payload.event.name).toBe('legacy_event');
    expect(payload.event.properties).toMatchObject({ foo: 'bar' });
    expect(payload.deviceId).toBeTruthy();
    expect(partitionKey).toBe(payload.deviceId);
  });

  it('mints the event id at the producer, like /track', async () => {
    await ingestLegacyEvent(makeRequest(), { buffers, produceIncomingEvent });

    expect(produced[0]?.payload.id).toMatch(UUID_PATTERN);
  });

  it('replaces the client-supplied timestamp with the server timestamp', async () => {
    await ingestLegacyEvent(makeRequest(), { buffers, produceIncomingEvent });

    const { payload } = produced[0]!;
    expect(payload.event.timestamp).toBe(requestTimestamp);
    expect(payload.event.isTimestampFromThePast).toBe(false);
  });

  it('refuses when the client carries no project', async () => {
    const outcome = await ingestLegacyEvent(makeRequest(null), {
      buffers,
      produceIncomingEvent,
    });

    expect(outcome.status).toBe('missing-project-id');
    expect(produced).toHaveLength(0);
  });
});

describe('recordLegacyEventRequest', () => {
  it('counts a request against its client id', async () => {
    const before = await counterValue(CLIENT_ID);

    recordLegacyEventRequest(CLIENT_ID);

    expect(await counterValue(CLIENT_ID)).toBe(before + 1);
  });

  it('keeps one series per client', async () => {
    const before = await counterValue(OTHER_CLIENT_ID);
    const otherBefore = await counterValue(CLIENT_ID);

    recordLegacyEventRequest(OTHER_CLIENT_ID);

    expect(await counterValue(OTHER_CLIENT_ID)).toBe(before + 1);
    expect(await counterValue(CLIENT_ID)).toBe(otherBefore);
  });

  it('is exposed under the name the removal decision will query', async () => {
    expect(await legacyEventRequestsTotal.get()).toMatchObject({
      name: 'openpanel_legacy_event_requests_total',
      type: 'counter',
    });
  });
});
