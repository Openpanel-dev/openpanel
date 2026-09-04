/**
 * Tests for the legacy `POST /event` compat route (ADR-015 entry 1, reversed:
 * the route is KEPT, produces to Kafka exactly like /track, and is measured
 * per client so the deferred removal decision has data).
 *
 * Covers:
 * - postEvent maps the legacy `{name, properties}` body onto the same Kafka
 *   produce path /track uses, with a producer-minted event id.
 * - legacyEventUsageHook increments openpanel_legacy_event_requests_total,
 *   labelled by client id, and never mints a label for an unauthenticated
 *   request.
 * The `mixan-*` header fallback moved with the validator itself into
 * @openpanel/core's ingest module (M8-002) — see
 * packages/core/src/modules/ingest/src/client-auth.test.ts.
 *
 * `@openpanel/db` is partially mocked (importActual + overrides) because it
 * imports `@openpanel/queue`, which the produce assertions replace.
 */

import { getAsnInfo, getGeoLocation } from '@openpanel/core';
import { getSalts } from '@openpanel/db';
import { produceIncomingEvent } from '@openpanel/queue';
import type { DeprecatedPostEventPayload } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postEvent } from './event.controller';
import { legacyEventUsageHook } from '@/hooks/legacy-event.hook';
import { legacyEventRequestsTotal } from '@/metrics';

vi.mock('@openpanel/queue', async () => {
  const actual =
    await vi.importActual<typeof import('@openpanel/queue')>(
      '@openpanel/queue'
    );
  return { ...actual, produceIncomingEvent: vi.fn() };
});

vi.mock('@openpanel/core', async () => {
  const actual =
    await vi.importActual<typeof import('@openpanel/core')>('@openpanel/core');
  return { ...actual, getGeoLocation: vi.fn(), getAsnInfo: vi.fn() };
});

vi.mock('@openpanel/db', async () => {
  const actual =
    await vi.importActual<typeof import('@openpanel/db')>('@openpanel/db');
  return { ...actual, getSalts: vi.fn() };
});

const PROJECT_ID = 'legacy-event-project';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const legacyBody = (
  overrides: Partial<DeprecatedPostEventPayload> = {}
): DeprecatedPostEventPayload => ({
  name: 'legacy_event',
  timestamp: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  properties: { __referrer: '', foo: 'bar' },
  ...overrides,
});

const makeRequest = (
  body: DeprecatedPostEventPayload,
  headers: Record<string, string> = {}
) =>
  ({
    body,
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)', ...headers },
    clientIp: '203.0.113.10',
    timestamp: Date.now(),
    client: { id: CLIENT_ID, projectId: PROJECT_ID },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }) as unknown as FastifyRequest<{ Body: DeprecatedPostEventPayload }>;

interface ReplySpy {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

const makeReply = (): FastifyReply & ReplySpy => {
  const reply = {
    status: vi.fn(() => reply),
    send: vi.fn(() => reply),
  } as ReplySpy;
  return reply as unknown as FastifyReply & ReplySpy;
};

const producedCall = () => {
  const call = vi.mocked(produceIncomingEvent).mock.calls[0];
  if (!call) {
    throw new Error('produceIncomingEvent was not called');
  }
  return { payload: call[0], partitionKey: call[1] };
};

const counterValue = async (clientId: string) => {
  const { values } = await legacyEventRequestsTotal.get();
  return (
    values.find((value) => value.labels.client_id === clientId)?.value ?? 0
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSalts).mockResolvedValue({
    current: 'current-salt',
    previous: 'previous-salt',
  });
  vi.mocked(getGeoLocation).mockResolvedValue({
    country: 'SE',
    city: 'Stockholm',
    region: 'Stockholm',
    longitude: 18,
    latitude: 59,
  } as Awaited<ReturnType<typeof getGeoLocation>>);
  vi.mocked(getAsnInfo).mockResolvedValue({
    asn: 1234,
    org: 'Example ISP',
    isHosting: false,
  });
  vi.mocked(produceIncomingEvent).mockResolvedValue(undefined);
});

describe('postEvent', () => {
  it('produces the legacy payload to Kafka and answers 202 "ok"', async () => {
    const request = makeRequest(legacyBody());
    const reply = makeReply();

    await postEvent(request, reply);

    expect(produceIncomingEvent).toHaveBeenCalledTimes(1);
    const { payload, partitionKey } = producedCall();

    expect(payload.projectId).toBe(PROJECT_ID);
    expect(payload.event.name).toBe('legacy_event');
    expect(payload.event.properties).toMatchObject({ foo: 'bar' });
    expect(payload.deviceId).toBeTruthy();
    expect(partitionKey).toBe(payload.deviceId);

    // V1's wire contract for this route: 202 with a plain-text body.
    expect(reply.status).toHaveBeenCalledWith(202);
    expect(reply.send).toHaveBeenCalledWith('ok');
  });

  it('mints the event id at the producer, like /track', async () => {
    await postEvent(makeRequest(legacyBody()), makeReply());

    expect(producedCall().payload.id).toMatch(UUID_PATTERN);
  });

  it('replaces the client-supplied timestamp with the server timestamp', async () => {
    const request = makeRequest(legacyBody());
    await postEvent(request, makeReply());

    const { payload } = producedCall();
    expect(payload.event.timestamp).toBe(request.timestamp);
    expect(payload.event.isTimestampFromThePast).toBe(false);
  });

  it('answers 400 when the client carries no project', async () => {
    const request = makeRequest(legacyBody());
    (request as { client?: unknown }).client = { id: CLIENT_ID };
    const reply = makeReply();

    await postEvent(request, reply);

    expect(produceIncomingEvent).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith('missing origin');
  });
});

describe('legacyEventUsageHook', () => {
  it('counts a request against its client id', async () => {
    const before = await counterValue(CLIENT_ID);

    await legacyEventUsageHook(makeRequest(legacyBody()));

    expect(await counterValue(CLIENT_ID)).toBe(before + 1);
  });

  it('keeps one series per client', async () => {
    const request = makeRequest(legacyBody());
    (request as { client?: unknown }).client = {
      id: OTHER_CLIENT_ID,
      projectId: PROJECT_ID,
    };
    const before = await counterValue(OTHER_CLIENT_ID);
    const otherBefore = await counterValue(CLIENT_ID);

    await legacyEventUsageHook(request);

    expect(await counterValue(OTHER_CLIENT_ID)).toBe(before + 1);
    expect(await counterValue(CLIENT_ID)).toBe(otherBefore);
  });

  it('mints no label for an unauthenticated request', async () => {
    const request = makeRequest(legacyBody());
    (request as { client?: unknown }).client = undefined;

    await legacyEventUsageHook(request);

    const { values } = await legacyEventRequestsTotal.get();
    expect(values.some((value) => !value.labels.client_id)).toBe(false);
  });

  it('is exposed under the name the removal decision will query', async () => {
    await expect(legacyEventRequestsTotal.get()).resolves.toMatchObject({
      name: 'openpanel_legacy_event_requests_total',
      type: 'counter',
    });
  });
});
