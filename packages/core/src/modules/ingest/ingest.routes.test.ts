import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { stubAppDeps } from '../../../test/http-fixtures';
import type { ClientAuthResult } from '../../http/client-auth';

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
const ingestLegacyEvent = mock(async () => ({ status: 'ok' as const }));
const checkIngestBot = mock(async () => undefined);
const isIngestionWoundDown = mock(async () => false);

mock.module('../../http/client-auth', () => ({ authenticateClient }));

const realService = { ...(await import('./ingest.service')) };
mock.module('./ingest.service', () => ({
  ...realService,
  isDuplicateIngestRequest,
  ingestTrack,
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
  ingestLegacyEvent.mockClear();
  checkIngestBot.mockClear();
  isIngestionWoundDown.mockClear();
});

function post(path: string) {
  const { deps } = stubAppDeps();
  return ingestRoutes(deps).handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(PAYLOAD),
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
