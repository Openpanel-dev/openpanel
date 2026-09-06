import { describe, expect, test } from 'bun:test';
import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { REQUEST_ID_LENGTH } from '../logger';
import { clientIpHook, requestIdHook, timestampHook } from './hooks';

const ALLOWED_ORIGIN = 'https://dashboard.test';

describe('requestIdHook', () => {
  const app = new Elysia()
    .use(requestIdHook())
    .get('/', ({ requestId, requestIdFromCaller }) => ({
      requestId,
      requestIdFromCaller,
    }));

  test('honours an inbound request-id header', async () => {
    const response = await app.handle(
      new Request('http://localhost/', {
        headers: { 'request-id': 'caller-supplied' },
      })
    );

    expect(await response.json()).toEqual({
      requestId: 'caller-supplied',
      requestIdFromCaller: true,
    });
  });

  test('mints one when the header is absent or unusable', async () => {
    const cases: Record<string, string>[] = [{}, { 'request-id': '???' }];
    for (const headers of cases) {
      const body = (await (
        await app.handle(new Request('http://localhost/', { headers }))
      ).json()) as { requestId: string; requestIdFromCaller: boolean };

      expect(body.requestId).toHaveLength(REQUEST_ID_LENGTH);
      expect(body.requestIdFromCaller).toBe(false);
    }
  });
});

describe('clientIpHook', () => {
  const app = new Elysia()
    .use(clientIpHook())
    .get('/', ({ clientIp, clientIpHeader }) => ({ clientIp, clientIpHeader }));

  test('prefers the client-forwarded header, as V1 does', async () => {
    const response = await app.handle(
      new Request('http://localhost/', {
        headers: {
          'openpanel-client-ip': '203.0.113.7',
          'cf-connecting-ip': '198.51.100.4',
        },
      })
    );

    expect(await response.json()).toEqual({
      clientIp: '203.0.113.7',
      clientIpHeader: 'openpanel-client-ip',
    });
  });

  test('falls back to empty strings, never undefined', async () => {
    const response = await app.handle(new Request('http://localhost/'));
    expect(await response.json()).toEqual({ clientIp: '', clientIpHeader: '' });
  });
});

// ADR-002 "behaviour that must be preserved explicitly" 2. V1's order held by
// avvio's registration order; here it holds by `.use()` order plus the fact
// that cors runs at `onRequest`, an earlier phase than any `derive`.
test('root chain runs cors -> requestId -> timestamp -> ip', async () => {
  const ran: string[] = [];

  const app = new Elysia()
    .use(
      cors({
        origin: (request) => {
          ran.push('cors');
          return request.headers.get('origin') === ALLOWED_ORIGIN;
        },
      })
    )
    .use(requestIdHook())
    .derive({ as: 'global' }, ({ requestId }) => {
      ran.push(`requestId:${requestId}`);
      return {};
    })
    .use(timestampHook())
    .derive({ as: 'global' }, ({ timestamp }) => {
      ran.push(`timestamp:${typeof timestamp}`);
      return {};
    })
    .use(clientIpHook())
    .derive({ as: 'global' }, ({ clientIp }) => {
      ran.push(`ip:${clientIp}`);
      return {};
    })
    .get('/', () => 'ok');

  const response = await app.handle(
    new Request('http://localhost/', {
      headers: {
        origin: ALLOWED_ORIGIN,
        'request-id': 'chain',
        'x-real-ip': '203.0.113.9',
      },
    })
  );

  expect(response.headers.get('access-control-allow-origin')).toBe(
    ALLOWED_ORIGIN
  );
  expect(ran).toEqual([
    'cors',
    'requestId:chain',
    'timestamp:number',
    'ip:203.0.113.9',
  ]);
});
