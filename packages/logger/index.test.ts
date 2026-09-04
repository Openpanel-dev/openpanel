import { describe, expect, it } from 'vitest';
import { redactSensitive, sanitizeUrlQuery } from './index';

describe('sanitizeUrlQuery', () => {
  it('replaces sensitive parameter values and keeps the rest', () => {
    expect(sanitizeUrlQuery('/x?token=abc&foo=1')).toBe(
      '/x?token=[REDACTED]&foo=1'
    );
  });

  it('returns URLs without a query string unchanged', () => {
    expect(sanitizeUrlQuery('/x')).toBe('/x');
    expect(sanitizeUrlQuery('/x?')).toBe('/x?');
  });
});

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
