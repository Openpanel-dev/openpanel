import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';

// In-memory `SET key value PX ttl NX` with a clock the test controls, so a
// retry "two seconds later" is deterministic.
let now = 0;
const keys = new Map<string, number>();
const getLock = mock(async (key: string, _value: string, ttlMs: number) => {
  const expiresAt = keys.get(key);
  if (expiresAt !== undefined && expiresAt > now) {
    return false;
  }
  keys.set(key, now + ttlMs);
  return true;
});
const realRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({ ...realRedis, getLock }));

let isDuplicateIngestRequest: typeof import('../ingest.service').isDuplicateIngestRequest;
beforeAll(async () => {
  ({ isDuplicateIngestRequest } = await import('../ingest.service'));
});

beforeEach(() => {
  now = 0;
  keys.clear();
  getLock.mockClear();
});

const RETRY_DELAY_MS = 2000;

function purchase(
  headers: Record<string, string>,
  id?: string
): Parameters<typeof isDuplicateIngestRequest>[0] {
  return {
    method: 'POST',
    clientIp: '81.2.69.142',
    headers,
    body: {
      type: 'track',
      payload: {
        name: 'purchase',
        profileId: 'u1',
        properties: { __revenue: 999 },
        ...(id ? { id } : {}),
      },
    },
  };
}

const server = { 'openpanel-client-id': 'project-a' };
const browser = { ...server, origin: 'https://shop.example' };

test('a server-side retry with the same event id is a duplicate', async () => {
  expect(await isDuplicateIngestRequest(purchase(server, 'order-42'))).toBe(
    false
  );
  now += RETRY_DELAY_MS;
  expect(await isDuplicateIngestRequest(purchase(server, 'order-42'))).toBe(
    true
  );
  expect(getLock).toHaveBeenCalledTimes(2);
});

test('the event id is remembered well past the 100 ms payload window', async () => {
  await isDuplicateIngestRequest(purchase(browser, 'order-42'));
  now += 60 * 60 * 1000;
  expect(await isDuplicateIngestRequest(purchase(browser, 'order-42'))).toBe(
    true
  );
});

test('the same event id in another project is not a duplicate', async () => {
  await isDuplicateIngestRequest(purchase(server, 'order-42'));
  const otherProject = { 'openpanel-client-id': 'project-b' };
  expect(
    await isDuplicateIngestRequest(purchase(otherProject, 'order-42'))
  ).toBe(false);
});

test('different event ids are both stored', async () => {
  await isDuplicateIngestRequest(purchase(server, 'order-42'));
  expect(await isDuplicateIngestRequest(purchase(server, 'order-43'))).toBe(
    false
  );
});

test('without an id, the browser pair is still collapsed by the payload hash', async () => {
  expect(await isDuplicateIngestRequest(purchase(browser))).toBe(false);
  expect(await isDuplicateIngestRequest(purchase(browser))).toBe(true);
  now += RETRY_DELAY_MS;
  expect(await isDuplicateIngestRequest(purchase(browser))).toBe(false);
});
