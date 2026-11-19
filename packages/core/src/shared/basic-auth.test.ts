import { describe, expect, it } from 'bun:test';
import { basicAuthChallenge, matchesBasicAuth } from './basic-auth';

const EXPECTED = { username: 'ops', password: 'hunter2' };

function header(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

describe('matchesBasicAuth', () => {
  it('accepts the exact pair', () => {
    expect(matchesBasicAuth(header('ops', 'hunter2'), EXPECTED)).toBe(true);
  });

  it('accepts a lowercase scheme', () => {
    const value = header('ops', 'hunter2').replace('Basic', 'basic');
    expect(matchesBasicAuth(value, EXPECTED)).toBe(true);
  });

  it('refuses a wrong username or password', () => {
    expect(matchesBasicAuth(header('ops', 'nope'), EXPECTED)).toBe(false);
    expect(matchesBasicAuth(header('nope', 'hunter2'), EXPECTED)).toBe(false);
  });

  it('refuses a missing, malformed or non-basic header', () => {
    expect(matchesBasicAuth(undefined, EXPECTED)).toBe(false);
    expect(matchesBasicAuth(null, EXPECTED)).toBe(false);
    expect(matchesBasicAuth('', EXPECTED)).toBe(false);
    expect(matchesBasicAuth('Basic', EXPECTED)).toBe(false);
    expect(matchesBasicAuth('Bearer token', EXPECTED)).toBe(false);
    expect(
      matchesBasicAuth(
        `Basic ${Buffer.from('no-separator').toString('base64')}`,
        EXPECTED
      )
    ).toBe(false);
  });

  it('keeps a colon in the password', () => {
    expect(
      matchesBasicAuth(header('ops', 'a:b'), {
        username: 'ops',
        password: 'a:b',
      })
    ).toBe(true);
  });

  it('challenges with the realm', () => {
    expect(basicAuthChallenge('OpenPanel ops')).toEqual({
      'WWW-Authenticate': 'Basic realm="OpenPanel ops"',
    });
  });
});
