import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEmailDomain,
  getOAuthAllowedDomains,
  isOAuthUserAllowedByDomain,
  parseOAuthAllowedDomains,
} from './src/oauth-allowed-domains';

describe('oauth allowed domains', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses comma-separated domains', () => {
    expect(
      parseOAuthAllowedDomains(' Example.com, @Example.org, example.com. ')
    ).toEqual(['example.com', 'example.org']);
  });

  it('reads global OAuth domains before provider-specific domains', () => {
    vi.stubEnv('OAUTH_ALLOWED_DOMAINS', 'example.com');
    vi.stubEnv('GOOGLE_ALLOWED_DOMAIN', 'google.example');

    expect(getOAuthAllowedDomains('google')).toEqual(['example.com']);
  });

  it('falls back to Google-specific domains for Google OAuth', () => {
    vi.stubEnv('GOOGLE_ALLOWED_DOMAIN', 'example.com');

    expect(getOAuthAllowedDomains('google')).toEqual(['example.com']);
    expect(getOAuthAllowedDomains('github')).toEqual([]);
  });

  it('extracts email domains case-insensitively', () => {
    expect(getEmailDomain('User@Example.COM')).toBe('example.com');
    expect(getEmailDomain('invalid-email')).toBeNull();
  });

  it('allows OAuth users when no allowlist is configured', () => {
    expect(
      isOAuthUserAllowedByDomain({
        provider: 'github',
        email: 'user@anywhere.example',
      })
    ).toBe(true);
  });

  it('checks GitHub users by verified email domain', () => {
    expect(
      isOAuthUserAllowedByDomain(
        {
          provider: 'github',
          email: 'user@example.com',
        },
        ['example.com']
      )
    ).toBe(true);

    expect(
      isOAuthUserAllowedByDomain(
        {
          provider: 'github',
          email: 'user@other.example',
        },
        ['example.com']
      )
    ).toBe(false);
  });

  it('requires Google hosted domain to match the allowlist', () => {
    expect(
      isOAuthUserAllowedByDomain(
        {
          provider: 'google',
          email: 'user@example.com',
          hostedDomain: 'example.com',
        },
        ['example.com']
      )
    ).toBe(true);

    expect(
      isOAuthUserAllowedByDomain(
        {
          provider: 'google',
          email: 'user@example.com',
        },
        ['example.com']
      )
    ).toBe(false);

    expect(
      isOAuthUserAllowedByDomain(
        {
          provider: 'google',
          email: 'user@example.com',
          hostedDomain: 'other.example',
        },
        ['example.com']
      )
    ).toBe(false);
  });
});
