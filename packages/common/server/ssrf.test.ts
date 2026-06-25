import { afterEach, describe, expect, it } from 'vitest';
import { assertSafeUrl } from './ssrf';

describe('assertSafeUrl', () => {
  const original = process.env.SELF_HOSTED;
  afterEach(() => {
    process.env.SELF_HOSTED = original;
  });

  it('rejects non-http(s) schemes on the cloud', async () => {
    process.env.SELF_HOSTED = '';
    await expect(assertSafeUrl('ftp://example.com')).rejects.toThrow();
  });

  it('rejects malformed URLs', async () => {
    process.env.SELF_HOSTED = '';
    await expect(assertSafeUrl('not a url')).rejects.toThrow();
  });

  it('rejects literal private / metadata hosts on the cloud', async () => {
    process.env.SELF_HOSTED = '';
    await expect(assertSafeUrl('http://127.0.0.1/x')).rejects.toThrow();
    await expect(assertSafeUrl('http://10.0.0.5/x')).rejects.toThrow();
    await expect(
      assertSafeUrl('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow();
    await expect(assertSafeUrl('http://[::1]/x')).rejects.toThrow();
  });

  it('is a no-op on self-hosted (operator controls the network)', async () => {
    process.env.SELF_HOSTED = 'true';
    await expect(assertSafeUrl('http://127.0.0.1/x')).resolves.toBeUndefined();
  });
});
