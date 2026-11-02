import { describe, expect, mock, test } from 'bun:test';
import { OpenPanel } from './index';

const TRACKED_IDS = { deviceId: 'device-1', sessionId: 'session-1' };
const DEVICELESS_IDS = { deviceId: '', sessionId: '' };

function createSdk() {
  const sdk = new OpenPanel({ clientId: 'test-client' });
  const fetch = mock(async () => TRACKED_IDS);
  sdk.api.fetch = fetch as unknown as typeof sdk.api.fetch;
  return { sdk, fetch };
}

describe('ids from /track', () => {
  test('a track event stores the device and session it resolved to', async () => {
    const { sdk, fetch } = createSdk();

    await sdk.track('signup');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sdk.getDeviceId()).toBe('device-1');
    expect(sdk.getSessionId()).toBe('session-1');
  });

  test('an ai event keeps the ids the other events resolved', async () => {
    const { sdk, fetch } = createSdk();
    await sdk.track('signup');
    fetch.mockResolvedValueOnce(DEVICELESS_IDS);

    await sdk.ai({ kind: 'span', traceId: 'trace-1' });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sdk.getDeviceId()).toBe('device-1');
    expect(sdk.getSessionId()).toBe('session-1');
  });

  test('an ai event on a fresh sdk adopts no ids', async () => {
    const { sdk, fetch } = createSdk();

    await sdk.ai({ kind: 'span', traceId: 'trace-1' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sdk.getDeviceId()).toBe('');
    expect(sdk.getSessionId()).toBe('');
  });
});
