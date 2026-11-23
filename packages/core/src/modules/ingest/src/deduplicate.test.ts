import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import type { GeoLocation } from '../../../clients/geo';
import type { ITrackHandlerPayload } from '../ingest.constants';

// In-memory Redis (SET with PX and optional NX, DEL) and a clock the test
// controls, so "a retry two seconds later" and "an hour later" are exact.
let now = 0;
const store = new Map<string, { value: string; expiresAt: number }>();
const live = (key: string) => {
  const entry = store.get(key);
  return entry && entry.expiresAt > now ? entry : undefined;
};
const set = mock(
  async (key: string, value: string, _px: 'PX', ttlMs: number, nx?: 'NX') => {
    if (nx && live(key)) {
      return null;
    }
    store.set(key, { value, expiresAt: now + ttlMs });
    return 'OK';
  }
);
const del = mock(async (key: string) => (store.delete(key) ? 1 : 0));
let failConfirm = false;
// Runs the two owner-checked scripts deduplicate.ts sends.
const evalScript = mock(
  async (
    script: string,
    _keys: number,
    key: string,
    token: string,
    ttl?: string
  ) => {
    if (live(key)?.value !== token) {
      return script.includes("'DEL'") ? 0 : null;
    }
    if (script.includes("'DEL'")) {
      return store.delete(key) ? 1 : 0;
    }
    if (failConfirm) {
      throw new Error('redis unavailable');
    }
    store.set(key, { value: 'accepted', expiresAt: now + Number(ttl) });
    return 'OK';
  }
);
const getLock = mock(
  async (key: string, value: string, ttlMs: number) =>
    (await set(key, value, 'PX', ttlMs, 'NX')) === 'OK'
);

const realRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  getLock,
  getRedisCache: () => ({ set, del, eval: evalScript }),
}));
mock.module('../../../clients/geo', () => ({
  getGeoLocation: mock(
    async (): Promise<GeoLocation> => ({
      country: 'SE',
      city: 'Stockholm',
      region: 'AB',
      longitude: 18,
      latitude: 59,
    })
  ),
  getAsnInfo: mock(async () => ({
    asn: undefined,
    org: undefined,
    isHosting: false,
  })),
}));

let ingestTrack: typeof import('../ingest.service').ingestTrack;
let isDuplicateIngestRequest: typeof import('../ingest.service').isDuplicateIngestRequest;
beforeAll(async () => {
  const salt = await import('../../salt/salt.service');
  mock.module('../../salt/salt.service', () => ({
    ...salt,
    getSalts: mock(async () => ({
      current: 'salt-current',
      previous: 'salt-previous',
    })),
  }));
  ({ ingestTrack, isDuplicateIngestRequest } = await import(
    '../ingest.service'
  ));
});

beforeEach(() => {
  now = 0;
  store.clear();
  set.mockClear();
  del.mockClear();
  evalScript.mockClear();
  warn.mockClear();
  failConfirm = false;
});

const RETRY_DELAY_MS = 2000;
const ELEVEN_MINUTES_MS = 11 * 60 * 1000;
const warn = mock(() => undefined);
const ONE_HOUR_MS = 60 * 60 * 1000;

const purchase = (id?: string): ITrackHandlerPayload =>
  ({
    type: 'track',
    payload: {
      name: 'purchase',
      profileId: 'u1',
      properties: { __revenue: 999 },
      ...(id ? { id } : {}),
    },
  }) as ITrackHandlerPayload;

const transport = (produce: ReturnType<typeof mock>) =>
  ({
    buffers: {
      session: {
        getExistingSessions: mock(async (_p: string, ids: string[]) =>
          ids.map(() => null)
        ),
      },
      replay: { add: mock(async () => undefined) },
      group: { add: mock(async () => undefined) },
    },
    produceIncomingEvent: produce,
    deps: { buffers: {}, config: testCoreConfig(), logger: { warn } },
  }) as unknown as Parameters<typeof ingestTrack>[1];

const send = (
  body: ITrackHandlerPayload,
  produce: ReturnType<typeof mock>,
  projectId = 'project-a'
) =>
  ingestTrack(
    {
      projectId,
      clientIp: '81.2.69.142',
      clientSecretAuth: true,
      timestamp: Date.UTC(2026, 10, 23, 12),
      headers: { 'user-agent': 'node-fetch/1.0' },
      body,
    },
    transport(produce)
  );

describe('client-supplied event id', () => {
  it('stores a retried event once', async () => {
    const produce = mock(async () => undefined);

    expect((await send(purchase('order-42'), produce)).status).toBe('ok');
    now += RETRY_DELAY_MS;
    expect((await send(purchase('order-42'), produce)).status).toBe(
      'duplicate'
    );

    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('remembers an accepted id well past the 100 ms payload window', async () => {
    const produce = mock(async () => undefined);

    await send(purchase('order-42'), produce);
    now += ONE_HOUR_MS;

    expect((await send(purchase('order-42'), produce)).status).toBe(
      'duplicate'
    );
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('processes a retry after a failed attempt', async () => {
    const failing = mock(() => Promise.reject(new Error('kafka unavailable')));
    await expect(send(purchase('order-42'), failing)).rejects.toThrow(
      'kafka unavailable'
    );
    expect(evalScript).toHaveBeenCalledTimes(1);

    const produce = mock(async () => undefined);
    now += RETRY_DELAY_MS;
    expect((await send(purchase('order-42'), produce)).status).toBe('ok');
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('answers duplicate to a concurrent request while the first is in flight', async () => {
    let finish: () => void = () => undefined;
    const slow = mock(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const first = send(purchase('order-42'), slow);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const second = await send(
      purchase('order-42'),
      mock(async () => undefined)
    );
    expect(second.status).toBe('duplicate');

    finish();
    expect((await first).status).toBe('ok');
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('still answers ok when the accepted marker cannot be written', async () => {
    const produce = mock(async () => undefined);
    failConfirm = true;

    expect((await send(purchase('order-42'), produce)).status).toBe('ok');
    expect(warn).toHaveBeenCalledTimes(1);

    now += RETRY_DELAY_MS;
    expect((await send(purchase('order-42'), produce)).status).toBe(
      'duplicate'
    );
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('a late failure never deletes a claim another request now owns', async () => {
    let fail: (error: Error) => void = () => undefined;
    const stalled = mock(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        })
    );
    const first = send(purchase('order-42'), stalled);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The first request outlives its claim; a retry takes over and succeeds.
    now += ELEVEN_MINUTES_MS;
    const produce = mock(async () => undefined);
    expect((await send(purchase('order-42'), produce)).status).toBe('ok');

    fail(new Error('kafka timeout'));
    await expect(first).rejects.toThrow('kafka timeout');

    expect((await send(purchase('order-42'), produce)).status).toBe(
      'duplicate'
    );
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('keys the id on the project, not across projects', async () => {
    const produce = mock(async () => undefined);

    await send(purchase('order-42'), produce, 'project-a');
    expect(
      (await send(purchase('order-42'), produce, 'project-b')).status
    ).toBe('ok');
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it('leaves events without an id alone', async () => {
    const produce = mock(async () => undefined);

    await send(purchase(), produce);
    await send(purchase(), produce);

    expect(produce).toHaveBeenCalledTimes(2);
    expect(set).not.toHaveBeenCalled();
  });

  it('does not reserve ids before authentication', async () => {
    const duplicate = await isDuplicateIngestRequest({
      method: 'POST',
      clientIp: '81.2.69.142',
      headers: { 'openpanel-client-id': 'project-a' },
      body: purchase('order-42'),
    });

    expect(duplicate).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});
