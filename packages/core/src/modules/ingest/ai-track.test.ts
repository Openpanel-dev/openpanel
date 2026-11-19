import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import type { Buffers } from '../../buffers/create-buffers';
import type { GeoLocation } from '../../clients/geo';
import type { ServiceDeps } from '../../services';
import type { ITrackHandlerPayload } from './ingest.constants';
import type { IncomingEventPayload } from './src/incoming-event';

const PROJECT_ID = 'ai-track-project';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';

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
const getSalts = mock(async (_deps: unknown) => ({
  current: 'salt-current',
  previous: 'salt-previous',
}));

mock.module('../../clients/geo', () => ({ getGeoLocation, getAsnInfo }));

let ingestTrack: typeof import('./ingest.service').ingestTrack;

let realSaltService: typeof import('../salt/salt.service');
beforeAll(async () => {
  realSaltService = { ...(await import('../salt/salt.service')) };
  mock.module('../salt/salt.service', () => ({
    ...realSaltService,
    getSalts,
  }));
  ({ ingestTrack } = await import('./ingest.service'));
});

afterAll(() => {
  mock.module('../salt/salt.service', () => realSaltService);
});

const produced: { payload: IncomingEventPayload; partitionKey: string }[] = [];
const produceIncomingEvent = async (
  payload: IncomingEventPayload,
  partitionKey: string
) => {
  produced.push({ payload, partitionKey });
};

const buffers = {
  session: {
    getExistingSessions: async (_projectId: string, deviceIds: string[]) =>
      deviceIds.map(() => null),
  },
  replay: {},
  group: {},
} as unknown as Buffers;

const transport = {
  buffers,
  produceIncomingEvent,
  deps: { buffers, config: testCoreConfig() } as unknown as ServiceDeps,
};

const aiRequest = (payload: Record<string, unknown> = {}) => ({
  projectId: PROJECT_ID,
  clientIp: '203.0.113.10',
  headers: { 'user-agent': BROWSER_USER_AGENT },
  clientSecretAuth: true,
  timestamp: Date.now(),
  body: {
    type: 'ai',
    payload: {
      kind: 'generation',
      traceId: 'trace-1',
      model: 'gpt-5-mini',
      provider: 'openai',
      ...payload,
    },
  } as ITrackHandlerPayload,
});

beforeEach(() => {
  produced.length = 0;
});

describe('ingestTrack with an ai body', () => {
  it('mints no device or session id, even with a browser user-agent', async () => {
    const outcome = await ingestTrack(aiRequest(), transport);

    expect(outcome).toEqual({ status: 'ok', deviceId: '', sessionId: '' });
    expect(getGeoLocation).toHaveBeenCalled();
    expect(produced).toHaveLength(1);
    const { payload, partitionKey } = produced[0]!;
    expect(payload.deviceId).toBe('');
    expect(payload.sessionId).toBe('');
    expect(partitionKey).toBeTruthy();
  });

  it('keeps a device id the caller sends', async () => {
    const outcome = await ingestTrack(
      aiRequest({ deviceId: 'device-from-caller' }),
      transport
    );

    expect(outcome).toMatchObject({
      status: 'ok',
      deviceId: 'device-from-caller',
    });
    expect(produced[0]!.payload.deviceId).toBe('device-from-caller');
  });
});
