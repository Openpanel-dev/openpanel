import { describe, expect, it } from 'vitest';
import { parseCookieDomain } from './parse-cookie-domain';

describe('parseCookieDomain', () => {
  it('should return undefined domain for empty string', () => {
    expect(parseCookieDomain('')).toEqual({
      domain: undefined,
      secure: false,
    });
  });

  describe('localhost and IP addresses', () => {
    it('should return undefined domain for localhost', () => {
      expect(parseCookieDomain('http://localhost:3000')).toEqual({
        domain: undefined,
        secure: false,
      });
    });

    it('should return undefined domain for localhost with https', () => {
      expect(parseCookieDomain('https://localhost:3000')).toEqual({
        domain: undefined,
        secure: true,
      });
    });

    it('should return undefined domain for IPv4 addresses', () => {
      expect(parseCookieDomain('http://192.168.1.1')).toEqual({
        domain: undefined,
        secure: false,
      });
    });

    it('should return undefined domain for IPv4 addresses with https', () => {
      expect(parseCookieDomain('https://192.168.1.1')).toEqual({
        domain: undefined,
        secure: true,
      });
    });

    it('should return undefined domain for IPv4 addresses with port', () => {
      expect(parseCookieDomain('http://192.168.1.1:8080')).toEqual({
        domain: undefined,
        secure: false,
      });
    });
  });

  describe('multi-part TLDs (co.uk, com.au, etc.)', () => {
    it('should handle co.uk domains correctly', () => {
      expect(parseCookieDomain('https://example.co.uk')).toEqual({
        domain: '.example.co.uk',
        secure: true,
      });
    });

    it('should handle subdomains of co.uk domains', () => {
      expect(parseCookieDomain('https://subdomain.example.co.uk')).toEqual({
        domain: '.example.co.uk',
        secure: true,
      });
    });

    it('should handle deep subdomains of co.uk domains', () => {
      expect(parseCookieDomain('https://api.subdomain.example.co.uk')).toEqual({
        domain: '.example.co.uk',
        secure: true,
      });
    });

    it('should handle com.au domains correctly', () => {
      expect(parseCookieDomain('https://example.com.au')).toEqual({
        domain: '.example.com.au',
        secure: true,
      });
    });

    it('should handle subdomains of com.au domains', () => {
      expect(parseCookieDomain('https://api.example.com.au')).toEqual({
        domain: '.example.com.au',
        secure: true,
      });
    });

    it('should handle co.za domains correctly', () => {
      expect(parseCookieDomain('https://example.co.za')).toEqual({
        domain: '.example.co.za',
        secure: true,
      });
    });

    it('should handle org.uk domains correctly', () => {
      expect(parseCookieDomain('https://example.org.uk')).toEqual({
        domain: '.example.org.uk',
        secure: true,
      });
    });

    it('should handle gov.uk domains correctly', () => {
      expect(parseCookieDomain('https://example.gov.uk')).toEqual({
        domain: '.example.gov.uk',
        secure: true,
      });
    });

    it('should handle ac.uk domains correctly', () => {
      expect(parseCookieDomain('https://example.ac.uk')).toEqual({
        domain: '.example.ac.uk',
        secure: true,
      });
    });

    it('should handle nhs.uk domains correctly', () => {
      expect(parseCookieDomain('https://example.nhs.uk')).toEqual({
        domain: '.example.nhs.uk',
        secure: true,
      });
    });
  });

  describe('regular domains', () => {
    it('should handle root domains correctly', () => {
      expect(parseCookieDomain('https://example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle root domains with http', () => {
      expect(parseCookieDomain('http://example.com')).toEqual({
        domain: '.example.com',
        secure: false,
      });
    });

    it('should handle subdomains correctly', () => {
      expect(parseCookieDomain('https://api.example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle deep subdomains correctly', () => {
      expect(parseCookieDomain('https://v1.api.example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle very deep subdomains correctly', () => {
      expect(parseCookieDomain('https://staging.v1.api.example.com')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });
  });

  describe('PaaS platform subdomains', () => {
    it('should handle zeabur.app subdomains correctly', () => {
      expect(parseCookieDomain('https://xxx.zeabur.app')).toEqual({
        domain: '.zeabur.app',
        secure: true,
      });
    });

    it('should handle railway.app subdomains correctly', () => {
      expect(parseCookieDomain('https://xxx.railway.app')).toEqual({
        domain: '.railway.app',
        secure: true,
      });
    });

    it('should handle vercel.app subdomains correctly', () => {
      expect(parseCookieDomain('https://xxx.vercel.app')).toEqual({
        domain: '.vercel.app',
        secure: true,
      });
    });

    it('should handle netlify.app subdomains correctly', () => {
      expect(parseCookieDomain('https://xxx.netlify.app')).toEqual({
        domain: '.netlify.app',
        secure: true,
      });
    });

    it('should handle render.com subdomains correctly', () => {
      expect(parseCookieDomain('https://xxx.onrender.com')).toEqual({
        domain: '.onrender.com',
        secure: true,
      });
    });
  });

  describe('edge cases and potential breaking scenarios', () => {
    it('should handle domains with ports', () => {
      expect(parseCookieDomain('https://example.com:8080')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with paths', () => {
      expect(parseCookieDomain('https://example.com/path')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with query parameters', () => {
      expect(parseCookieDomain('https://example.com?param=value')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with fragments', () => {
      expect(parseCookieDomain('https://example.com#fragment')).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle domains with all URL components', () => {
      expect(
        parseCookieDomain('https://example.com:8080/path?param=value#fragment'),
      ).toEqual({
        domain: '.example.com',
        secure: true,
      });
    });

    it('should handle single-level domains', () => {
      expect(parseCookieDomain('https://example')).toEqual({
        domain: '.example',
        secure: true,
      });
    });

    it('should handle domains with underscores (invalid but should not crash)', () => {
      expect(parseCookieDomain('https://example_test.com')).toEqual({
        domain: '.example_test.com',
        secure: true,
      });
    });

    it('should handle domains with hyphens', () => {
      expect(parseCookieDomain('https://example-test.com')).toEqual({
        domain: '.example-test.com',
        secure: true,
      });
    });

    it('should handle domains with numbers', () => {
      expect(parseCookieDomain('https://example123.com')).toEqual({
        domain: '.example123.com',
        secure: true,
      });
    });
  });

  describe('error cases that should break', () => {
    it('should throw error for invalid URLs', () => {
      expect(() => parseCookieDomain('not-a-url')).toThrow();
    });

    it('should throw error for URLs without protocol', () => {
      expect(() => parseCookieDomain('example.com')).toThrow();
    });

    it('should throw error for malformed URLs', () => {
      expect(() => parseCookieDomain('http://')).toThrow();
    });

    it('should throw error for URLs with invalid characters', () => {
      expect(() =>
        parseCookieDomain('http://example.com:invalid-port'),
      ).toThrow();
    });
  });

  describe('specific real-world scenarios', () => {
    it('should handle openpanel.dev domains correctly', () => {
      expect(parseCookieDomain('https://api.openpanel.dev')).toEqual({
        domain: '.openpanel.dev',
        secure: true,
      });
    });

    it('should handle dashboard.openpanel.dev domains correctly', () => {
      expect(parseCookieDomain('https://dashboard.openpanel.dev')).toEqual({
        domain: '.openpanel.dev',
        secure: true,
      });
    });

    it('should handle subdomains of openpanel.dev correctly', () => {
      expect(
        parseCookieDomain('https://staging.dashboard.openpanel.dev'),
      ).toEqual({
        domain: '.openpanel.dev',
        secure: true,
      });
    });

    it('should handle custom domains correctly', () => {
      expect(parseCookieDomain('https://myapp.com')).toEqual({
        domain: '.myapp.com',
        secure: true,
      });
    });

    it('should handle subdomains of custom domains correctly', () => {
      expect(parseCookieDomain('https://api.myapp.com')).toEqual({
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

    multiPartTLDs.forEach((tld) => {
      it(`should handle ${tld} domains correctly`, () => {
        expect(parseCookieDomain(`https://example.${tld}`)).toEqual({
          domain: `.example.${tld}`,
          secure: true,
        });
      });

      it(`should handle subdomains of ${tld} domains correctly`, () => {
        expect(parseCookieDomain(`https://api.example.${tld}`)).toEqual({
          domain: `.example.${tld}`,
          secure: true,
        });
      });
    });
  });
});
