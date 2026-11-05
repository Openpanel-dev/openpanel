import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getWebViewUserAgent } from './user-agent';

describe('Expo User-Agent interop', () => {
  test('accepts the default export and preserves the method receiver', async () => {
    const constants = {
      value: 'Expo/55',
      async getWebViewUserAgentAsync() {
        return this.value;
      },
    };
    assert.equal(await getWebViewUserAgent({ default: constants }), 'Expo/55');
  });

  test('accepts a namespace helper even with an unrelated default export', async () => {
    assert.equal(
      await getWebViewUserAgent({
        default: {},
        getWebViewUserAgentAsync: async () => 'Expo/18',
      }),
      'Expo/18'
    );
  });

  test('omits the header when the helper is absent or unsupported', async () => {
    for (const module of [
      null,
      undefined,
      {},
      { default: {} },
      {
        getWebViewUserAgentAsync: 'unavailable',
      },
    ]) {
      assert.equal(await getWebViewUserAgent(module), null);
    }
  });

  test('contains synchronous native errors', async () => {
    assert.equal(
      await getWebViewUserAgent({
        getWebViewUserAgentAsync() {
          throw new Error('Native module unavailable');
        },
      }),
      null
    );
  });

  test('contains asynchronous native errors', async () => {
    assert.equal(
      await getWebViewUserAgent({
        getWebViewUserAgentAsync: async () => {
          throw new Error('Unsupported runtime');
        },
      }),
      null
    );
  });

  test('preserves a null response', async () => {
    assert.equal(
      await getWebViewUserAgent({
        getWebViewUserAgentAsync: async () => null,
      }),
      null
    );
  });
});
