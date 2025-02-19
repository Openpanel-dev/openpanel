import { describe, expect, it } from 'vitest';
import { getReferrerWithQuery, parseReferrer } from './parse-referrer';

describe('parseReferrer', () => {
  it('should handle undefined or empty URLs', () => {
    expect(parseReferrer(undefined)).toEqual({
      name: '',
      type: 'unknown',
      url: '',
    });

    expect(parseReferrer('')).toEqual({
      name: '',
      type: 'unknown',
      url: '',
    });
  });

  it('should parse valid referrer URLs', () => {
    expect(parseReferrer('https://google.com/search?q=test')).toEqual({
      name: 'Google',
      type: 'search',
      url: 'https://google.com/search?q=test',
    });
  });

  it('should handle www prefix in hostnames', () => {
    expect(parseReferrer('https://www.twitter.com/user')).toEqual({
      name: 'Twitter',
      type: 'social',
      url: 'https://www.twitter.com/user',
    });

    expect(parseReferrer('https://twitter.com/user')).toEqual({
      name: 'Twitter',
      type: 'social',
      url: 'https://twitter.com/user',
    });
  });

  it('should handle unknown referrers', () => {
    expect(parseReferrer('https://unknown-site.com')).toEqual({
      name: '',
      type: 'unknown',
      url: 'https://unknown-site.com',
    });
  });

  it('should handle invalid URLs', () => {
    expect(parseReferrer('not-a-url')).toEqual({
      name: '',
      type: 'unknown',
      url: 'not-a-url',
    });
  });
});

describe('getReferrerWithQuery', () => {
  it('should handle undefined or empty query', () => {
    expect(getReferrerWithQuery(undefined)).toBeNull();
    expect(getReferrerWithQuery({})).toBeNull();
  });

  it('should parse utm_source parameter', () => {
    expect(getReferrerWithQuery({ utm_source: 'google' })).toEqual({
      name: 'Google',
      type: 'unknown',
      url: '',
    });
  });

  it('should parse ref parameter', () => {
    expect(getReferrerWithQuery({ ref: 'facebook' })).toEqual({
      name: 'Facebook',
      type: 'social',
      url: '',
    });
  });

  it('should parse utm_referrer parameter', () => {
    expect(getReferrerWithQuery({ utm_referrer: 'twitter' })).toEqual({
      name: 'Twitter',
      type: 'social',
      url: '',
    });
  });

  it('should handle case-insensitive matching', () => {
    expect(getReferrerWithQuery({ utm_source: 'GoOgLe' })).toEqual({
      name: 'Google',
      type: 'unknown',
      url: '',
    });
  });

  it('should handle unknown sources', () => {
    expect(getReferrerWithQuery({ utm_source: 'unknown-source' })).toEqual({
      name: 'unknown-source',
      type: 'unknown',
      url: '',
    });
  });

  it('should prioritize utm_source over ref and utm_referrer', () => {
    expect(
      getReferrerWithQuery({
        utm_source: 'google',
        ref: 'facebook',
        utm_referrer: 'twitter',
      }),
    ).toEqual({
      name: 'Google',
      type: 'unknown',
      url: '',
    });
  });
});
