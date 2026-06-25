import { afterEach, describe, expect, it } from 'vitest';
import { assertSafeUrl, isBlockedAddress } from './ssrf';

describe('isBlockedAddress', () => {
  it('blocks private / loopback / link-local / metadata', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('10.0.0.5')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
    expect(isBlockedAddress('169.254.169.254')).toBe(true); // cloud metadata
    expect(isBlockedAddress('100.64.0.1')).toBe(true); // CGNAT
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('fd00::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertSafeUrl', () => {
  const original = process.env.SELF_HOSTED;
  afterEach(() => {
    process.env.SELF_HOSTED = original;
  });

  it('rejects non-http(s) schemes on the cloud', async () => {
    process.env.SELF_HOSTED = '';
    await expect(assertSafeUrl('ftp://example.com')).rejects.toThrow();
  });

  it('rejects literal private / metadata hosts on the cloud', async () => {
    process.env.SELF_HOSTED = '';
    await expect(assertSafeUrl('http://127.0.0.1/x')).rejects.toThrow();
    await expect(
      assertSafeUrl('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow();
  });

  it('is a no-op on self-hosted (operator controls the network)', async () => {
    process.env.SELF_HOSTED = 'true';
    await expect(assertSafeUrl('http://127.0.0.1/x')).resolves.toBeUndefined();
  });
});
