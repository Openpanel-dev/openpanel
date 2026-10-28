import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { stubAppDeps } from '../../../test/http-fixtures';
import type { ClientAuthResult } from '../../http/client-auth';
import { errorHandler } from '../../http/errors';
import type { TrackOutcome } from './ingest.service';

const IDENTITY = { deviceId: 'device-1', sessionId: 'session-1' };
const PAYLOAD = { type: 'track', payload: { name: 'screen_view' } };
const authenticateClient = mock(
  (): Promise<ClientAuthResult> =>
    Promise.resolve({
      ok: true,
      client: {
        id: 'client-1',
        projectId: 'project-1',
        organizationId: 'organization-1',
        type: 'write',
        secretVerified: true,
      },
    })
);
const isDuplicateIngestRequest = mock(async () => true);
const ingestTrack = mock(async () => ({ status: 'ok' as const, ...IDENTITY }));
const ingestTrackBatch = mock(
  async (_request: {
    projectId: string | null;
    items: unknown[];
  }): Promise<TrackOutcome[]> => []
);
const ingestLegacyEvent = mock(async () => ({ status: 'ok' as const }));
const checkIngestBot = mock(async () => undefined);
const isIngestionWoundDown = mock(async () => false);

mock.module('../../http/client-auth', () => ({ authenticateClient }));

const realService = { ...(await import('./ingest.service')) };
mock.module('./ingest.service', () => ({
  ...realService,
  isDuplicateIngestRequest,
  ingestTrack,
  ingestTrackBatch,
  ingestLegacyEvent,
  checkIngestBot,
  isIngestionWoundDown,
}));

let ingestRoutes: typeof import('./ingest.routes').ingestRoutes;

beforeAll(async () => {
  ({ ingestRoutes } = await import('./ingest.routes'));
});

beforeEach(() => {
  isDuplicateIngestRequest.mockReset();
  isDuplicateIngestRequest.mockResolvedValue(true);
  authenticateClient.mockClear();
  ingestTrack.mockClear();
  ingestTrackBatch.mockClear();
  ingestLegacyEvent.mockClear();
  checkIngestBot.mockClear();
  isIngestionWoundDown.mockClear();
});

// The error handler is mounted so a refused body gets the 400 the assembled
// app answers with, which is what a batch item's 400 has to match.
function post(path: string, body: unknown = PAYLOAD) {
  const { deps } = stubAppDeps();
  return new Elysia()
    .use(errorHandler(deps, { production: false }))
    .use(ingestRoutes(deps))
    .handle(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
}

for (const path of ['/track', '/event']) {
  test(`duplicate ${path} answers JSON without processing the event again`, async () => {
    const response = await post(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(await response.text())).toEqual({ duplicate: true });
    expect(isDuplicateIngestRequest).toHaveBeenCalledTimes(1);
    expect(authenticateClient).not.toHaveBeenCalled();
    expect(ingestTrack).not.toHaveBeenCalled();
    expect(ingestLegacyEvent).not.toHaveBeenCalled();
    expect(checkIngestBot).not.toHaveBeenCalled();
    expect(isIngestionWoundDown).not.toHaveBeenCalled();
  });
}

test('a non-duplicate track still returns device and session identity', async () => {
  isDuplicateIngestRequest.mockResolvedValue(false);

  const response = await post('/track');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(IDENTITY);
  expect(isDuplicateIngestRequest).toHaveBeenCalledTimes(1);
  expect(authenticateClient).toHaveBeenCalledTimes(1);
  expect(ingestTrack).toHaveBeenCalledTimes(1);
  expect(ingestLegacyEvent).not.toHaveBeenCalled();
  expect(checkIngestBot).toHaveBeenCalledTimes(1);
  expect(isIngestionWoundDown).toHaveBeenCalledTimes(1);
});

const TOO_SHORT = 'Too small: expected string to have >=1 characters';

test('a batch answers 200 with what each item would have got on its own', async () => {
  isDuplicateIngestRequest.mockResolvedValue(false);
  ingestTrackBatch.mockResolvedValueOnce([
    { status: 'ok', ...IDENTITY },
    {
      status: 'invalid-payload',
      path: 'payload.1.payload.name',
      message: TOO_SHORT,
    },
    { status: 'profile-not-found' },
  ]);
  const items = [PAYLOAD, { type: 'track', payload: { name: '' } }, PAYLOAD];

  const response = await post('/track', { type: 'batch', payload: items });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    IDENTITY,
    {
      status: 400,
      error: 'Error',
      message: `body/payload.1.payload.name ${TOO_SHORT}`,
    },
    { status: 404, message: 'Profile not found' },
  ]);
  expect(ingestTrackBatch).toHaveBeenCalledTimes(1);
  expect(ingestTrackBatch.mock.calls[0]?.[0]).toMatchObject({
    projectId: 'project-1',
    items,
  });
  expect(ingestTrack).not.toHaveBeenCalled();
});

test('a bad single body gets the same 400 body as a bad batch item', async () => {
  isDuplicateIngestRequest.mockResolvedValue(false);

  const response = await post('/track', {
    type: 'track',
    payload: { name: '' },
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    status: 400,
    error: 'Error',
    message: `body/payload.name ${TOO_SHORT}`,
  });
  expect(ingestTrack).not.toHaveBeenCalled();
});

test('an empty or oversized batch is refused before anything is ingested', async () => {
  isDuplicateIngestRequest.mockResolvedValue(false);

  for (const length of [0, 251]) {
    const response = await post('/track', {
      type: 'batch',
      payload: Array.from({ length }, () => PAYLOAD),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message: string };
    expect(body.message).toStartWith('body/payload ');
  }
  expect(ingestTrackBatch).not.toHaveBeenCalled();
  expect(ingestTrack).not.toHaveBeenCalled();
});
