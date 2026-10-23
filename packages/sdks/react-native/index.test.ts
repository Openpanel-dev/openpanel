import { afterEach, describe, expect, mock, test } from 'bun:test';

let referrer: () => Promise<string> = async () => 'utm_source=play';
let platform = 'android';
let foreground: ((state: string) => void) | undefined;
let globalProperties: Record<string, unknown> = {};
const getInstallReferrerAsync = mock(() => referrer());
mock.module('@openpanel/sdk', () => ({
  OpenPanel: class {
    api = { addHeader: mock(() => undefined) };
    queue: unknown[] = [];
    setGlobalProperties(value: Record<string, unknown>) {
      globalProperties = { ...globalProperties, ...value };
    }
    flush = mock(() => undefined);
  },
}));
mock.module('expo-application', () => ({
  nativeApplicationVersion: '2.1.0',
  nativeBuildVersion: '42',
  getInstallReferrerAsync,
}));
mock.module('expo-constants', () => ({ default: {} }));
mock.module('react-native', () => ({
  AppState: {
    addEventListener(_name: string, callback: (state: string) => void) {
      foreground = callback;
    },
  },
  Platform: {
    get OS() {
      return platform;
    },
  },
}));
const { OpenPanel } = await import('./index');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const version = { __version: '2.1.0', __buildNumber: '42' };
afterEach(() => {
  globalProperties = {};
  foreground = undefined;
  platform = 'android';
  referrer = async () => 'utm_source=play';
  getInstallReferrerAsync.mockClear();
});
describe('optional Android install referrer', () => {
  test('initialization retains version metadata when native lookup rejects', async () => {
    referrer = async () => {
      throw new Error('Install referrer unavailable');
    };
    new OpenPanel({ clientId: 'test' });
    await settle();
    expect(globalProperties).toEqual(version);
    expect(getInstallReferrerAsync).toHaveBeenCalledTimes(1);
  });
  test('foreground refresh preserves known attribution if lookup fails', async () => {
    new OpenPanel({ clientId: 'test' });
    await settle();
    referrer = async () => {
      throw new Error('Service disconnected');
    };
    foreground?.('active');
    await settle();
    expect(globalProperties).toEqual({
      ...version,
      __referrer: 'utm_source=play',
    });
    expect(getInstallReferrerAsync).toHaveBeenCalledTimes(2);
  });
  test('recovers on foreground after synchronous native failure', async () => {
    referrer = () => {
      throw new Error('Native module unavailable');
    };
    new OpenPanel({ clientId: 'test' });
    await settle();
    expect(globalProperties).toEqual(version);
    referrer = async () => 'utm_source=recovered';
    foreground?.('active');
    await settle();
    expect(globalProperties).toEqual({
      ...version,
      __referrer: 'utm_source=recovered',
    });
    expect(getInstallReferrerAsync).toHaveBeenCalledTimes(2);
  });
  test('keeps the successful Android referrer', async () => {
    new OpenPanel({ clientId: 'test' });
    await settle();
    expect(globalProperties).toEqual({
      ...version,
      __referrer: 'utm_source=play',
    });
  });
  test('does not call the Android lookup on iOS', async () => {
    platform = 'ios';
    referrer = () => {
      throw new Error('Android API called on iOS');
    };
    new OpenPanel({ clientId: 'test' });
    await settle();
    expect(globalProperties).toEqual(version);
    expect(getInstallReferrerAsync).not.toHaveBeenCalled();
  });
});
