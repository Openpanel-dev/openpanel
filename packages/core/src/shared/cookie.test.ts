import { describe, expect, test } from 'bun:test';
import type { CookieOptions, ISetCookie } from './cookie';

describe('ISetCookie', () => {
  test('a conforming implementation receives key, value and options', () => {
    const calls: Array<{
      key: string;
      value: string;
      options: CookieOptions;
    }> = [];
    const setCookie: ISetCookie = (key, value, options) => {
      calls.push({ key, value, options });
    };

    setCookie('session', 'token-value', { httpOnly: true, path: '/' });

    expect(calls).toEqual([
      {
        key: 'session',
        value: 'token-value',
        options: { httpOnly: true, path: '/' },
      },
    ]);
  });

  test('deleting a cookie is expressing a zero maxAge, not a separate API', () => {
    const calls: CookieOptions[] = [];
    const setCookie: ISetCookie = (_key, _value, options) => {
      calls.push(options);
    };

    setCookie('session', '', { maxAge: 0 });

    expect(calls[0]?.maxAge).toBe(0);
  });
});
