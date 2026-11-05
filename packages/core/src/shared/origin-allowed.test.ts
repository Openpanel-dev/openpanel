import { describe, expect, it } from 'bun:test';
import { isOriginAllowed } from './origin-allowed';

describe('isOriginAllowed', () => {
  it('matches an exact origin, ignoring protocol, www and trailing slash', () => {
    expect(isOriginAllowed(['https://www.foo.com/'], 'https://foo.com')).toBe(
      true
    );
    expect(isOriginAllowed(['foo.com'], 'https://bar.com')).toBe(false);
  });

  it('matches subdomains of a wildcard entry on any port', () => {
    expect(isOriginAllowed(['*.foo.com'], 'https://app.foo.com')).toBe(true);
    expect(isOriginAllowed(['*.foo.com'], 'https://a.b.foo.com')).toBe(true);
    expect(isOriginAllowed(['*.foo.com'], 'http://app.foo.com:3000')).toBe(
      true
    );
  });

  it('requires the whole host to match a wildcard entry', () => {
    for (const origin of [
      'https://app.foo.com.evil.com',
      'https://evil.com/?app.foo.com',
      'https://evil-foo.com',
      'https://foo.com',
    ]) {
      expect([origin, isOriginAllowed(['*.foo.com'], origin)]).toEqual([
        origin,
        false,
      ]);
    }
  });

  it('honours a port in a wildcard entry', () => {
    expect(isOriginAllowed(['localhost:*'], 'http://localhost:5173')).toBe(
      true
    );
    expect(isOriginAllowed(['*.foo.com:8080'], 'https://a.foo.com:3000')).toBe(
      false
    );
  });

  it('treats regex syntax in an entry as literal text', () => {
    expect(isOriginAllowed(['*.fo+.com'], 'https://a.fooo.com')).toBe(false);
    expect(isOriginAllowed(['(a+)+*'], `https://${'a'.repeat(5000)}!`)).toBe(
      false
    );
  });

  it('allows any origin for *, but not a missing one', () => {
    expect(isOriginAllowed(['*'], 'https://anything.dev')).toBe(true);
    expect(isOriginAllowed(['*'], undefined)).toBe(false);
  });
});
