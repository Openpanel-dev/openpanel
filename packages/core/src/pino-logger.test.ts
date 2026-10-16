import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { hyperdxTransport, redactSensitive } from './pino-logger';

describe('redactSensitive', () => {
  it('filters the query of a string url value', () => {
    expect(redactSensitive({ url: '/x?token=abc&foo=1' })).toEqual({
      url: '/x?token=[REDACTED]&foo=1',
    });
  });

  it('covers keys that merely contain url', () => {
    expect(redactSensitive({ requestUrl: '/x?apikey=abc' })).toEqual({
      requestUrl: '/x?apikey=[REDACTED]',
    });
  });

  it('leaves a non-string url value to the existing recursion', () => {
    expect(redactSensitive({ url: { path: '/x', token: 'abc' } })).toEqual({
      url: { path: '/x', token: '[REDACTED]' },
    });
  });

  it('still redacts sensitive keys by name', () => {
    expect(redactSensitive({ authorization: 'Bearer abc', page: 2 })).toEqual({
      authorization: '[REDACTED]',
      page: 2,
    });
  });
});

describe('hyperdxTransport', () => {
  // pino resolves a bare target from the module that called pino(), which
  // in the api image is apps/api — a package that does not install HyperDX.
  it('hands pino an absolute path that exists, not a package name', () => {
    const { target } = hyperdxTransport('info', 'test-service');
    expect(isAbsolute(target)).toBe(true);
    expect(existsSync(target)).toBe(true);
  });
});
