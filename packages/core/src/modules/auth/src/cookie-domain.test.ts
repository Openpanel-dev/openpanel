import { describe, expect, it } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import { parseCookieDomain } from './cookie-domain';

/** The config the loader builds for an environment with no COOKIE_TLDS set. */
const parse = (url: string) => parseCookieDomain(testCoreConfig(), url);

/** COOKIE_TLDS, already split and lowercased by the loader. */
const parseWithTlds = (extraMultiPartTlds: string[], url: string) =>
  parseCookieDomain(
    testCoreConfig({
      cookies: { secret: 'test', extraMultiPartTlds, customDomain: undefined },
    }),
    url
  );

describe('parseCookieDomain', () => {
  it('should return undefined domain for empty string', () => {
    expect(parse('')).toEqual({
      domain: undefined,
      secure: false,
    });
  });

  describe('localhost and IP addresses', () => {
    it('should return undefined domain for localhost', () => {
      expect(parse('http://localhost:3000')).toEqual({
        domain: undefined,
        secure: false,
      });
    });

    it('should return undefined domain for localhost with https', () => {
      expect(parse('https://localhost:3000')).toEqual({
        domain: undefined,
        secure: true,
      });
    });

    it('should return undefined domain for IPv4 addresses', () => {
      expect(parse('http://192.168.1.1')).toEqual({
        domain: undefined,
        secure: false,
      });
    });

    it('should return undefined domain for IPv4 addresses with https', () => {
      expect(parse('https://192.168.1.1')).toEqual({
        domain: undefined,
        secure: true,
      });
    });

    it('should return undefined domain for IPv4 addresses with port', () => {
      expect(parse('http://192.168.1.1:8080')).toEqual({
        domain: undefined,
        secure: false,
      });
    });
  });

  describe('multi-part TLDs (co.uk, com.au, etc.)', () => {
    it('should handle co.uk domains correctly', () => {
      expect(parse('https://example.co.uk')).toEqual({
        domain: '.example.co.uk',
        secure: true,
      });
    });

    it('should handle subdomains of co.uk domains', () => {
      expect(parse('https://subdomain.example.co.uk')).toEqual({
        domain: '.example.co.uk',
        secure: true,
      });
    });

    it('should handle deep subdomains of co.uk domains', () => {
      expect(parse('https://api.subdomain.example.co.uk')).toEqual({
        domain: '.example.co.uk',
        secure: true,
      });
    });

    it('should handle com.au domains correctly', () => {
      expect(parse('https://example.com.au')).toEqual({
        domain: '.example.com.au',
        secure: true,
      });
    });

    it('should handle subdomains of com.au domains', () => {
      expect(parse('https://api.example.com.au')).toEqual({
        domain: '.example.com.au',
        secure: true,
      });
    });

    it('should handle co.za domains correctly', () => {
      expect(parse('https://example.co.za')).toEqual({
        domain: '.example.co.za',
        secure: true,
      });
    });

    it('should handle org.uk domains correctly', () => {
      expect(parse('https://example.org.uk')).toEqual({
        domain: '.example.org.uk',
        secure: true,
      });
    });

    it('should handle gov.uk domains correctly', () => {
      expect(parse('https://example.gov.uk')).toEqual({
        domain: '.example.gov.uk',
        secure: true,
      });
    });

    it('should handle ac.uk domains correctly', () => {
      expect(parse('https://example.ac.uk')).toEqual({
        domain: '.example.ac.uk',
        secure: true,
      });
    });

    it('should handle nhs.uk domains correctly', () => {
      expect(parse('https://example.nhs.uk')).toEqual({
        domain: '.example.nhs.uk',
        secure: true,
      });
    });
  });

  describe('regular domains', () => {
    it('should handle root domains correctly', () => {
      expect(parse('https://example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle root domains with http', () => {
      expect(parse('http://example.com')).toEqual({
        domain: '.example.com',
        secure: false,
      });
    });

    it('should handle subdomains correctly', () => {
      expect(parse('https://api.example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle deep subdomains correctly', () => {
      expect(parse('https://v1.api.example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle very deep subdomains correctly', () => {
      expect(parse('https://staging.v1.api.example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });
  });

  describe('PaaS platform subdomains', () => {
    it('should handle zeabur.app subdomains correctly', () => {
      expect(parse('https://xxx.zeabur.app')).toEqual({
        domain: '.zeabur.app',
        secure: true,
      });
    });

    it('should handle railway.app subdomains correctly', () => {
      expect(parse('https://xxx.railway.app')).toEqual({
        domain: '.railway.app',
        secure: true,
      });
    });

    it('should handle vercel.app subdomains correctly', () => {
      expect(parse('https://xxx.vercel.app')).toEqual({
        domain: '.vercel.app',
        secure: true,
      });
    });

    it('should handle netlify.app subdomains correctly', () => {
      expect(parse('https://xxx.netlify.app')).toEqual({
        domain: '.netlify.app',
        secure: true,
      });
    });

    it('should handle render.com subdomains correctly', () => {
      expect(parse('https://xxx.onrender.com')).toEqual({
        domain: '.onrender.com',
        secure: true,
      });
    });
  });

  describe('edge cases and potential breaking scenarios', () => {
    it('should handle domains with ports', () => {
      expect(parse('https://example.com:8080')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with paths', () => {
      expect(parse('https://example.com/path')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with query parameters', () => {
      expect(parse('https://example.com?param=value')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with fragments', () => {
      expect(parse('https://example.com#fragment')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with all URL components', () => {
      expect(
        parse('https://example.com:8080/path?param=value#fragment')
      ).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle single-level domains', () => {
      expect(parse('https://example')).toEqual({
        domain: '.example',
        secure: true,
      });
    });

    it('should handle domains with underscores (invalid but should not crash)', () => {
      expect(parse('https://example_test.com')).toEqual({
        domain: '.example_test.com',
        secure: true,
      });
    });

    it('should handle domains with hyphens', () => {
      expect(parse('https://example-test.com')).toEqual({
        domain: '.example-test.com',
        secure: true,
      });
    });

    it('should handle domains with numbers', () => {
      expect(parse('https://example123.com')).toEqual({
        domain: '.example123.com',
        secure: true,
      });
    });
  });

  describe('error cases that should break', () => {
    it('should throw error for invalid URLs', () => {
      expect(() => parse('not-a-url')).toThrow();
    });

    it('should throw error for URLs without protocol', () => {
      expect(() => parse('example.com')).toThrow();
    });

    it('should throw error for malformed URLs', () => {
      expect(() => parse('http://')).toThrow();
    });

    it('should throw error for URLs with invalid characters', () => {
      expect(() => parse('http://example.com:invalid-port')).toThrow();
    });
  });

  describe('specific real-world scenarios', () => {
    it('should handle openpanel.dev domains correctly', () => {
      expect(parse('https://api.openpanel.dev')).toEqual({
        domain: '.openpanel.dev',
        secure: true,
      });
    });

    it('should handle dashboard.openpanel.dev domains correctly', () => {
      expect(parse('https://dashboard.openpanel.dev')).toEqual({
        domain: '.openpanel.dev',
        secure: true,
      });
    });

    it('should handle subdomains of openpanel.dev correctly', () => {
      expect(parse('https://staging.dashboard.openpanel.dev')).toEqual({
        domain: '.openpanel.dev',
        secure: true,
      });
    });

    it('should handle custom domains correctly', () => {
      expect(parse('https://myapp.com')).toEqual({
        domain: '.myapp.com',
        secure: true,
      });
    });

    it('should handle subdomains of custom domains correctly', () => {
      expect(parse('https://api.myapp.com')).toEqual({
        domain: '.myapp.com',
        secure: true,
      });
    });
  });

  describe('all multi-part TLDs from the list', () => {
    const multiPartTLDs = [
      'co.uk',
      'com.au',
      'co.za',
      'co.nz',
      'co.jp',
      'co.kr',
      'co.in',
      'co.il',
      'com.br',
      'com.mx',
      'com.ar',
      'com.pe',
      'com.cl',
      'com.co',
      'com.ve',
      'net.au',
      'org.au',
      'gov.au',
      'edu.au',
      'net.nz',
      'org.nz',
      'gov.nz',
      'org.uk',
      'gov.uk',
      'ac.uk',
      'nhs.uk',
      'org.za',
      'gov.za',
      'ac.za',
      'ac.jp',
      'or.jp',
      'go.jp',
      'or.kr',
      'go.kr',
      'org.in',
      'gov.in',
      'ac.in',
      'org.il',
      'gov.il',
      'ac.il',
      'net.br',
      'org.br',
      'gov.br',
      'net.mx',
      'org.mx',
      'gov.mx',
      'net.ar',
      'org.ar',
      'gov.ar',
      'net.pe',
      'org.pe',
      'gov.pe',
      'net.cl',
      'org.cl',
      'gov.cl',
      'net.co',
      'org.co',
      'gov.co',
      'net.ve',
      'org.ve',
      'gov.ve',
    ];

    for (const tld of multiPartTLDs) {
      it(`should handle ${tld} domains correctly`, () => {
        expect(parse(`https://example.${tld}`)).toEqual({
          domain: `.example.${tld}`,
          secure: true,
        });
      });

      it(`should handle subdomains of ${tld} domains correctly`, () => {
        expect(parse(`https://api.example.${tld}`)).toEqual({
          domain: `.example.${tld}`,
          secure: true,
        });
      });
    }
  });

  describe('custom multi-part TLDs via COOKIE_TLDS', () => {
    it('should handle my.id domains when COOKIE_TLDS includes my.id', () => {
      expect(parseWithTlds(['my.id'], 'https://abc.my.id')).toEqual({
        domain: '.abc.my.id',
        secure: true,
      });
    });

    it('should handle subdomains of my.id domains correctly', () => {
      expect(parseWithTlds(['my.id'], 'https://api.abc.my.id')).toEqual({
        domain: '.abc.my.id',
        secure: true,
      });
    });

    it('should handle multiple custom TLDs', () => {
      const tlds = ['my.id', 'web.id', 'co.id'];

      expect(parseWithTlds(tlds, 'https://abc.my.id')).toEqual({
        domain: '.abc.my.id',
        secure: true,
      });

      expect(parseWithTlds(tlds, 'https://abc.web.id')).toEqual({
        domain: '.abc.web.id',
        secure: true,
      });

      expect(parseWithTlds(tlds, 'https://abc.co.id')).toEqual({
        domain: '.abc.co.id',
        secure: true,
      });
    });

    // Trimming and lowercasing happen in the config loader (`tokenList` plus
    // the transform), so what reaches here is already normalised.
    it('should handle case-insensitive custom TLDs', () => {
      expect(parseWithTlds(['my.id'], 'https://abc.my.id')).toEqual({
        domain: '.abc.my.id',
        secure: true,
      });
    });

    it('should not affect domains when the list is empty', () => {
      // Without the custom TLD, my.id is treated as a regular TLD
      expect(parseWithTlds([], 'https://abc.my.id')).toEqual({
        domain: '.my.id',
        secure: true,
      });
      expect(parse('https://abc.my.id')).toEqual({
        domain: '.my.id',
        secure: true,
      });
    });

    it('should still work with built-in multi-part TLDs when custom TLDs are set', () => {
      // Built-in TLDs should still work
      expect(parseWithTlds(['my.id'], 'https://example.co.uk')).toEqual({
        domain: '.example.co.uk',
        secure: true,
      });
    });

    it('uses CUSTOM_COOKIE_DOMAIN verbatim when it is set', () => {
      expect(
        parseCookieDomain(
          testCoreConfig({
            cookies: {
              secret: 'test',
              extraMultiPartTlds: [],
              customDomain: '.openpanel.dev',
            },
          }),
          'https://abc.my.id'
        )
      ).toEqual({ domain: '.openpanel.dev', secure: true });
    });
  });
});
