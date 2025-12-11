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
      os: 'iOS',
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

    const result = parseUserAgent(ua);
    expect(result.isServer).toBe(false);
    expect(result.device).toBe('desktop');
    expect(result.os).toBe('Windows');
    expect(result.osVersion).toBe('10');
    expect(result.browser).toBe('Chrome');
    expect(result.browserVersion).toBe('91.0.4472.124');
    // Desktop browsers don't have brand/model
    expect(result.model).toBeUndefined();
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

  it('should detect known phone models as mobile', () => {
    // Xiaomi/Redmi
    expect(getDevice('', 'Redmi Note 8 Pro')).toBe('mobile');
    expect(getDevice('', 'POCO F3')).toBe('mobile');
    expect(getDevice('', 'Mi 11')).toBe('mobile');

    // Samsung Galaxy phones
    expect(getDevice('', 'Galaxy S23 Ultra')).toBe('mobile');
    expect(getDevice('', 'Galaxy A54')).toBe('mobile');
    expect(getDevice('', 'Galaxy Z Fold5')).toBe('mobile');

    // Google Pixel
    expect(getDevice('', 'Pixel 8 Pro')).toBe('mobile');

    // OnePlus
    expect(getDevice('', 'OnePlus 11')).toBe('mobile');

    // Huawei/Honor
    expect(getDevice('', 'Huawei P60 Pro')).toBe('mobile');
    expect(getDevice('', 'Honor 90')).toBe('mobile');

    // OPPO/Vivo/Realme
    expect(getDevice('', 'OPPO Find X6')).toBe('mobile');
    expect(getDevice('', 'Vivo X90')).toBe('mobile');
    expect(getDevice('', 'Realme GT5')).toBe('mobile');

    // Motorola
    expect(getDevice('', 'Moto G84')).toBe('mobile');
  });
});

describe('parseUserAgent - brand detection', () => {
  it('should detect Xiaomi brand from Manufacturer field', () => {
    const result = parseUserAgent(
      'App/1.0 (Android 12; Model=POCO X5; Manufacturer=Xiaomi)',
    );
    expect(result.brand).toBe('Xiaomi');
    expect(result.model).toBe('POCO X5');
    expect(result.device).toBe('mobile');
  });

  it('should detect Samsung brand from model name', () => {
    const result = parseUserAgent(
      'App/1.0 (Android 13; Model=Galaxy S23 Ultra)',
    );
    expect(result.brand).toBe('Samsung');
    expect(result.model).toBe('Galaxy S23 Ultra');
    expect(result.device).toBe('mobile');
  });

  it('should detect Google Pixel', () => {
    const result = parseUserAgent('App/1.0 (Android 14; Model=Pixel 8 Pro)');
    expect(result.brand).toBe('Google');
    expect(result.model).toBe('Pixel 8 Pro');
    expect(result.os).toBe('Android');
    expect(result.osVersion).toBe('14');
    expect(result.device).toBe('mobile');
  });

  it('should detect OnePlus', () => {
    const result = parseUserAgent(
      'App/1.0 (Android 13; Model=OnePlus 11; Manufacturer=OnePlus)',
    );
    expect(result.brand).toBe('OnePlus');
    expect(result.model).toBe('OnePlus 11');
    expect(result.device).toBe('mobile');
    expect(result.os).toBe('Android');
    expect(result.osVersion).toBe('13');
  });

  it('should detect Huawei', () => {
    const result = parseUserAgent(
      'App/1.0 (Android 12; Model=P60 Pro; Manufacturer=Huawei)',
    );
    expect(result.brand).toBe('Huawei');
    expect(result.model).toBe('P60 Pro');
    expect(result.device).toBe('mobile');
    expect(result.os).toBe('Android');
    expect(result.osVersion).toBe('12');
  });
});
