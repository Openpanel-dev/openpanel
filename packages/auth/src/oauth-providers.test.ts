import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getEnabledOAuthLoginProviders,
  isOAuthLoginEnabled,
} from './oauth-providers';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  for (const key of [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_REDIRECT_URI',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'DISABLE_GITHUB_AUTH',
    'DISABLE_GOOGLE_AUTH',
  ]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function enableGithub() {
  process.env.GITHUB_CLIENT_ID = 'gh-id';
  process.env.GITHUB_CLIENT_SECRET = 'gh-secret';
  process.env.GITHUB_REDIRECT_URI =
    'https://api.example.com/oauth/github/callback';
}

function enableGoogle() {
  process.env.GOOGLE_CLIENT_ID = 'go-id';
  process.env.GOOGLE_CLIENT_SECRET = 'go-secret';
  process.env.GOOGLE_REDIRECT_URI =
    'https://api.example.com/oauth/google/callback';
}

describe('isOAuthLoginEnabled', () => {
  it('is false when provider credentials are unset', () => {
    expect(isOAuthLoginEnabled('github')).toBe(false);
    expect(isOAuthLoginEnabled('google')).toBe(false);
  });

  it('is true when github client id, secret, and redirect uri are set', () => {
    enableGithub();
    expect(isOAuthLoginEnabled('github')).toBe(true);
  });

  it('is true when google client id, secret, and redirect uri are set', () => {
    enableGoogle();
    expect(isOAuthLoginEnabled('google')).toBe(true);
  });

  it('is false when any required github credential is missing', () => {
    enableGithub();
    delete process.env.GITHUB_CLIENT_SECRET;
    expect(isOAuthLoginEnabled('github')).toBe(false);
  });

  it('is false when DISABLE_GITHUB_AUTH is true even with credentials', () => {
    enableGithub();
    process.env.DISABLE_GITHUB_AUTH = 'true';
    expect(isOAuthLoginEnabled('github')).toBe(false);
  });

  it('is false when DISABLE_GOOGLE_AUTH is 1 even with credentials', () => {
    enableGoogle();
    process.env.DISABLE_GOOGLE_AUTH = '1';
    expect(isOAuthLoginEnabled('google')).toBe(false);
  });

  it('treats blank credential strings as unset', () => {
    process.env.GITHUB_CLIENT_ID = '  ';
    process.env.GITHUB_CLIENT_SECRET = 'gh-secret';
    process.env.GITHUB_REDIRECT_URI =
      'https://api.example.com/oauth/github/callback';
    expect(isOAuthLoginEnabled('github')).toBe(false);
  });
});

describe('getEnabledOAuthLoginProviders', () => {
  it('reports each provider independently', () => {
    enableGithub();
    expect(getEnabledOAuthLoginProviders()).toEqual({
      github: true,
      google: false,
    });
  });
});
