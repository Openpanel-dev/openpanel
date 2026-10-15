import { expect, mock, test } from 'bun:test';
import type { AppDeps } from '../context';
import type { GarbageCollectionResult, MemorySnapshot } from '../shared/memory';
import { memoryRoutes } from './memory.routes';

const ADMIN = { username: 'ops', password: 'secret-pass' };
const BASE = 'http://localhost/admin/memory';

const info = mock((_object: unknown, _message?: string) => undefined);
const deps = { logger: { info } } as unknown as AppDeps;
const app = memoryRoutes(deps, ADMIN);

function basic(username: string, password: string): Record<string, string> {
  return {
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}

const ROUTES = [
  ['GET', BASE],
  ['POST', `${BASE}/gc`],
  ['POST', `${BASE}/gc?all=1`],
  ['GET', `${BASE}/heap-snapshot`],
] as const;

test('every route refuses a missing or wrong password and challenges the browser', async () => {
  for (const [method, url] of ROUTES) {
    for (const headers of [{}, basic('ops', 'wrong')]) {
      const response = await app.handle(new Request(url, { method, headers }));
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('Basic');
    }
  }
});

test('the snapshot reports memory and the requested number of object types', async () => {
  const response = await app.handle(
    new Request(`${BASE}?top=3`, { headers: basic('ops', 'secret-pass') })
  );
  const body = (await response.json()) as MemorySnapshot;

  expect(response.status).toBe(200);
  expect(body.rss).toBeGreaterThan(0);
  expect(body.heapUsed).toBeGreaterThan(0);
  expect(body.topObjectTypes).toHaveLength(3);
});

test('a local gc returns before/after for this process and logs it', async () => {
  const response = await app.handle(
    new Request(`${BASE}/gc`, {
      method: 'POST',
      headers: basic('ops', 'secret-pass'),
    })
  );
  const body = (await response.json()) as GarbageCollectionResult;

  expect(response.status).toBe(200);
  expect(body.before.rss).toBeGreaterThan(0);
  expect(body.freed.heapUsed).toBe(body.before.heapUsed - body.after.heapUsed);
  expect(info).toHaveBeenCalledTimes(1);
});
