import { describe, expect, it } from 'bun:test';
import {
  createShareAccessToken,
  hasShareAccess,
  shareAccessCookieName,
} from './share-access';

const SECRET = 'test-cookie-secret';
const SHARE = {
  type: 'dashboard' as const,
  id: 'share_1',
  passwordHash: '$argon2id$v=19$hash-a',
};

function jar(entries: Record<string, string>) {
  return { get: (name: string) => entries[name] };
}

function unlocked(share = SHARE, secret = SECRET) {
  return jar({
    [shareAccessCookieName(share.type, share.id)]: createShareAccessToken(
      secret,
      share
    ),
  });
}

describe('share access cookie', () => {
  it('accepts the token it issued', () => {
    expect(hasShareAccess(SECRET, unlocked(), SHARE)).toBe(true);
  });

  it('refuses a forged value — the bypass this replaces', () => {
    const forged = jar({
      [shareAccessCookieName('dashboard', 'share_1')]: '1',
    });
    expect(hasShareAccess(SECRET, forged, SHARE)).toBe(false);
  });

  it('refuses a missing cookie', () => {
    expect(hasShareAccess(SECRET, jar({}), SHARE)).toBe(false);
  });

  it('refuses a token minted for another share', () => {
    const other = { ...SHARE, id: 'share_2' };
    const cookies = jar({
      [shareAccessCookieName('dashboard', 'share_1')]: createShareAccessToken(
        SECRET,
        other
      ),
    });
    expect(hasShareAccess(SECRET, cookies, SHARE)).toBe(false);
  });

  it('refuses a token minted for another share type', () => {
    const cookies = jar({
      [shareAccessCookieName('dashboard', 'share_1')]: createShareAccessToken(
        SECRET,
        { ...SHARE, type: 'report' }
      ),
    });
    expect(hasShareAccess(SECRET, cookies, SHARE)).toBe(false);
  });

  it('stops working when the password changes', () => {
    const cookies = unlocked();
    const rotated = { ...SHARE, passwordHash: '$argon2id$v=19$hash-b' };
    expect(hasShareAccess(SECRET, cookies, rotated)).toBe(false);
  });

  it('refuses a token minted under another secret', () => {
    const cookies = unlocked(SHARE, 'someone-elses-secret');
    expect(hasShareAccess(SECRET, cookies, SHARE)).toBe(false);
  });

  it('refuses rather than keying the HMAC with a blank secret', () => {
    expect(() => createShareAccessToken('', SHARE)).toThrow('COOKIE_SECRET');
    expect(() => hasShareAccess('', unlocked(), SHARE)).toThrow(
      'COOKIE_SECRET'
    );
  });
});
