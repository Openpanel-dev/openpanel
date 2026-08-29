import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSafeUrl, createPinnedLookup } from './ssrf';

describe('assertSafeUrl', () => {
  const original = process.env.SELF_HOSTED;
  afterEach(() => {
    // Assigning undefined would leave the string "undefined" behind, which is
    // truthy — restore by deleting instead.
    if (original === undefined) {
      delete process.env.SELF_HOSTED;
    } else {
      process.env.SELF_HOSTED = original;
    }
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
    await expect(assertSafeUrl('http://127.0.0.1/x')).resolves.toBeNull();
  });

  it('only treats "true"/"1" as self-hosted', async () => {
    // Bare truthiness would read SELF_HOSTED="false" as self-hosted and drop
    // the guard on the cloud.
    for (const value of ['false', '0', 'no']) {
      process.env.SELF_HOSTED = value;
      await expect(assertSafeUrl('http://127.0.0.1/x')).rejects.toThrow();
    }
    process.env.SELF_HOSTED = '1';
    await expect(assertSafeUrl('http://127.0.0.1/x')).resolves.toBeNull();
  });

  it('returns the validated addresses so the caller can pin to them', async () => {
    // Validating without pinning is check-then-connect: a client that resolves
    // the hostname again can be steered elsewhere by a changed DNS answer.
    process.env.SELF_HOSTED = '';
    await expect(assertSafeUrl('http://93.184.216.34/x')).resolves.toEqual([
      '93.184.216.34',
    ]);
  });
});

describe('createPinnedLookup', () => {
  it('resolves every hostname to the pinned address', () => {
    const lookup = createPinnedLookup('93.184.216.34');

    const single = vi.fn();
    lookup('anything.example', {}, single);
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);

    const all = vi.fn();
    lookup('anything.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  it('reports IPv6 addresses with the right family', () => {
    const lookup = createPinnedLookup('2606:2800:220:1:248:1893:25c8:1946');
    const cb = vi.fn();
    lookup('anything.example', {}, cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      '2606:2800:220:1:248:1893:25c8:1946',
      6,
    );
  });
});
