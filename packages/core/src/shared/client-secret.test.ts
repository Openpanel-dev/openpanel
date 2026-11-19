import { describe, expect, it } from 'bun:test';
import { hash as hashArgon2 } from '@node-rs/argon2';
import { hashClientSecret, verifyClientSecret } from './client-secret';

describe('client secrets', () => {
  it('hashes with scrypt and round-trips', async () => {
    const stored = await hashClientSecret('sec_abc');
    expect(stored).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{64}$/);
    expect(await verifyClientSecret('sec_abc', stored)).toBe(true);
    expect(await verifyClientSecret('sec_nope', stored)).toBe(false);
  });

  it('still verifies argon2 rows minted before the fix', async () => {
    const stored = await hashArgon2('sec_abc');
    expect(await verifyClientSecret('sec_abc', stored)).toBe(true);
    expect(await verifyClientSecret('sec_nope', stored)).toBe(false);
  });

  it('treats a malformed stored hash as a failed verification', async () => {
    expect(await verifyClientSecret('sec_abc', 'garbage')).toBe(false);
    expect(await verifyClientSecret('sec_abc', '')).toBe(false);
  });
});
