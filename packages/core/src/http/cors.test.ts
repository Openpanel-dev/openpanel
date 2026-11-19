import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { corsDelegator } from './cors';

const DASHBOARD_ORIGIN = 'https://dashboard.example.com';
const OTHER_ORIGIN = 'https://evil.example.com';

const app = new Elysia()
  .use(corsDelegator({ dashboardOrigins: [DASHBOARD_ORIGIN] }))
  .get('/admin/memory/heap-snapshot', () => 'snapshot')
  .get('/bullboard', () => 'board')
  .get('/trpc/x', () => 'trpc')
  .get('/track', () => 'track');

async function allowedOrigin(path: string, origin: string) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, { headers: { origin } })
  );
  return response.headers.get('access-control-allow-origin');
}

test('operator routes are readable from no other origin, not even the dashboard', async () => {
  for (const path of ['/admin/memory/heap-snapshot', '/bullboard']) {
    for (const origin of [DASHBOARD_ORIGIN, OTHER_ORIGIN]) {
      expect(await allowedOrigin(path, origin)).toBeNull();
    }
  }
});

test('private routes admit only the dashboard, open routes any origin', async () => {
  expect(await allowedOrigin('/trpc/x', DASHBOARD_ORIGIN)).toBe(
    DASHBOARD_ORIGIN
  );
  expect(await allowedOrigin('/trpc/x', OTHER_ORIGIN)).toBeNull();
  expect(await allowedOrigin('/track', OTHER_ORIGIN)).toBe(OTHER_ORIGIN);
});
