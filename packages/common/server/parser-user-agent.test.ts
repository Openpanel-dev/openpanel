import { describe, expect, it } from 'vitest';
import { getDevice, parseUserAgent } from './parser-user-agent';

describe('parseUserAgent', () => {
  it('should return server UA for null/undefined input', () => {
    const serverUa = {
      isServer: true,
      device: 'server',
      os: '',
      osVersion: '',
      browser: '',
      browserVersion: '',
      brand: '',
      model: '',
    };

    expect(parseUserAgent(null)).toEqual(serverUa);
    expect(parseUserAgent(undefined)).toEqual(serverUa);
  });

  it('should parse iPhone user agents', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

    expect(parseUserAgent(ua)).toEqual({
      isServer: false,
      device: 'mobile',
      os: 'iOS',
      osVersion: '16.5',
      browser: 'Mobile Safari',
      browserVersion: '16.5',
      brand: 'Apple',
      model: 'iPhone',
    });
  });

  it('should parse iPad user agents', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

    expect(parseUserAgent(ua)).toEqual({
      isServer: false,
      device: 'tablet',
      os: 'iOS',
      osVersion: '16.5',
      browser: 'Mobile Safari',
      browserVersion: '16.5',
      brand: 'Apple',
      model: 'iPad',
    });
  });

  it('should parse iPadOS user agents', () => {
    const ua =
      'Mozilla/5.0 (iPad; iPadOS 18_0; like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/18.0';

    expect(parseUserAgent(ua)).toEqual({
      isServer: false,
      device: 'tablet',
      os: 'Mac OS',
      osVersion: '18.0',
      browser: 'WebKit',
      browserVersion: '605.1.15',
      brand: 'Apple',
      model: 'iPad',
    });
  });

  it('should parse desktop Chrome user agents', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    expect(parseUserAgent(ua)).toEqual({
      isServer: false,
      device: 'desktop',
      os: 'Windows',
      osVersion: '10',
      browser: 'Chrome',
      browserVersion: '91.0.4472.124',
      brand: undefined,
      model: undefined,
    });
  });

  it('should handle server user agents', () => {
    const serverUas = [
      'Go-http-client/1.0',
      'Go Http Client/1.0',
      'node-fetch/1.0',
    ];

    const expectedResult = {
      isServer: true,
      device: 'server',
      os: '',
      osVersion: '',
      browser: '',
      browserVersion: '',
      brand: '',
      model: '',
    };

    serverUas.forEach((ua) => {
      expect(parseUserAgent(ua)).toEqual(expectedResult);
    });
  });

  it('should apply overrides when provided', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15';
    const overrides = {
      __os: 'Custom OS',
      __osVersion: '1.0',
      __browser: 'Custom Browser',
      __browserVersion: '2.0',
      __device: 'custom-device',
      __brand: 'Custom Brand',
      __model: 'Custom Model',
    };

    expect(parseUserAgent(ua, overrides)).toEqual({
      isServer: false,
      device: 'custom-device',
      os: 'Custom OS',
      osVersion: '1.0',
      browser: 'Custom Browser',
      browserVersion: '2.0',
      brand: 'Custom Brand',
      model: 'Custom Model',
    });
  });
});

describe('getDevice', () => {
  it('should detect mobile devices', () => {
    const mobileUas = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (Linux; Android 10; SM-A505FN) AppleWebKit/537.36',
      'Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebkit/534.30',
    ];

    mobileUas.forEach((ua) => {
      expect(getDevice(ua)).toBe('mobile');
    });
  });

  it('should detect tablet devices', () => {
    const tabletUas = [
      'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (Linux; Android 10.0; Tablet; rv:68.0) Gecko/68.0 Firefox/68.0',
      'Mozilla/5.0 (Linux; Android 7.0; SM-T827R4 Build/NRD90M)',
    ];

    tabletUas.forEach((ua) => {
      expect(getDevice(ua)).toBe('tablet');
    });
  });

  it('should default to desktop for non-mobile/tablet devices', () => {
    const desktopUas = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    ];

    desktopUas.forEach((ua) => {
      expect(getDevice(ua)).toBe('desktop');
    });
  });
});
