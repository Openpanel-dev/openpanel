/**
 * Tests for validateIngestRequest — V1's `validateSdkRequest`, moved with
 * M8-002.
 *
 * The `mixan-*` case comes from apps/api/src/controllers/event.controller.test.ts:
 * ADR-015 entry 5 is pending the `/event` usage metric, so the legacy header
 * fallback stays. The `secretPresented` assertion is what V1 asserted as
 * `request.clientSecretAuth` — the side channel the bot check reads.
 */

import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = 'legacy-event-project';

const client = {
  id: CLIENT_ID,
  projectId: PROJECT_ID,
  organizationId: 'org-1',
  type: 'write',
  secret: null,
  // Keeps this test about the header fallback rather than re-proving secret
  // verification, which the auth contracts already cover.
  ignoreCorsAndSecret: true,
  project: {
    id: PROJECT_ID,
    filters: [],
    allowUnsafeRevenueTracking: false,
    cors: [],
  },
};

const getClientByIdCached = mock(async (_id: string) => client);

mock.module('../../client/client.service', () => ({ getClientByIdCached }));

let validateIngestRequest: typeof import('./client-auth').validateIngestRequest;

beforeAll(async () => {
  ({ validateIngestRequest } = await import('./client-auth'));
});

beforeEach(() => {
  getClientByIdCached.mockClear();
});

const body = { name: 'legacy_event', properties: { foo: 'bar' } };

describe('validateIngestRequest', () => {
  it('authenticates a client sent as mixan-client-id (ADR-015 entry 5 deferred)', async () => {
    const result = await validateIngestRequest({
      headers: {
        'mixan-client-id': CLIENT_ID,
        'mixan-client-secret': 'legacy-secret',
      },
      clientIp: '203.0.113.10',
      body,
    });

    expect(getClientByIdCached).toHaveBeenCalledWith(CLIENT_ID);
    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretPresented).toBe(true);
  });

  it('accepts the openpanel-* headers and reports no secret when none was sent', async () => {
    const result = await validateIngestRequest({
      headers: { 'openpanel-client-id': CLIENT_ID },
      clientIp: '203.0.113.10',
      body,
    });

    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretPresented).toBe(false);
  });

  it('falls back to the credentials carried in the body', async () => {
    const result = await validateIngestRequest({
      headers: {},
      clientIp: '203.0.113.10',
      body: { ...body, clientId: CLIENT_ID, clientSecret: 'from-body' },
    });

    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretPresented).toBe(true);
  });

  // A refusal is RETURNED, never thrown: the caller builds the error so its
  // stack is captured outside core's bundle chunk (see client-auth.ts).
  it('refuses a missing client id without throwing', async () => {
    const result = await validateIngestRequest({
      headers: {},
      clientIp: '1.2.3.4',
      body,
    });

    expect(result).toMatchObject({
      ok: false,
      message: 'Ingestion: Missing client id',
    });
    expect(getClientByIdCached).not.toHaveBeenCalled();
  });

  it('refuses a client id that is not a UUIDv4', async () => {
    const result = await validateIngestRequest({
      headers: { 'openpanel-client-id': 'not-a-uuid' },
      clientIp: '1.2.3.4',
      body,
    });

    expect(result).toMatchObject({
      ok: false,
      message: 'Ingestion: Client ID must be a valid UUIDv4',
    });
  });

  it('redacts the presented secret in the refusal payload', async () => {
    const result = await validateIngestRequest({
      headers: {
        'openpanel-client-id': 'not-a-uuid',
        'openpanel-client-secret': 'abcdefghijklmnop',
      },
      clientIp: '1.2.3.4',
      body,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.payload.clientSecret).toBe(
      'abcde...lmnop'
    );
    expect(result.secretPresented).toBe(true);
  });

  it('refuses revenue tracking without a client secret', async () => {
    const result = await validateIngestRequest({
      headers: { 'openpanel-client-id': CLIENT_ID },
      clientIp: '1.2.3.4',
      body: { ...body, properties: { __revenue: 100 } },
    });

    expect(result).toMatchObject({
      ok: false,
      message:
        'Ingestion: Revenue tracking is not allowed without a client secret',
    });
  });

  it('blocks an ip listed in the project filters', async () => {
    getClientByIdCached.mockResolvedValueOnce({
      ...client,
      project: {
        ...client.project,
        filters: [{ type: 'ip', ip: '203.0.113.10' }],
      },
    } as unknown as typeof client);

    const result = await validateIngestRequest({
      headers: { 'openpanel-client-id': CLIENT_ID },
      clientIp: '203.0.113.10',
      body,
    });

    expect(result).toMatchObject({
      ok: false,
      message: 'Ingestion: IP address is blocked by project filter',
    });
  });
});
