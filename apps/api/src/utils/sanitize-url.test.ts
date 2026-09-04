/**
 * Tests for sanitizeUrl — the helper used wherever a raw request URL is
 * logged. Query strings on some routes carry credentials, and the logger only
 * redacts by object key, so the value has to be filtered before it is logged.
 */

import { describe, expect, it } from 'vitest';
import { sanitizeUrl } from './sanitize-url';

describe('sanitizeUrl', () => {
  it('replaces a token value and keeps the path', () => {
    expect(sanitizeUrl('/mcp?token=abc123')).toBe('/mcp?token=[REDACTED]');
  });

  it('keeps parameters that are not sensitive', () => {
    expect(sanitizeUrl('/mcp?token=abc123&projectId=proj-1')).toBe(
      '/mcp?token=[REDACTED]&projectId=proj-1'
    );
  });

  it('matches parameter names case-insensitively', () => {
    expect(sanitizeUrl('/mcp?TOKEN=abc&Token=def&accessToken=ghi')).toBe(
      '/mcp?TOKEN=[REDACTED]&Token=[REDACTED]&accessToken=[REDACTED]'
    );
  });

  it('replaces every occurrence of a repeated parameter', () => {
    expect(sanitizeUrl('/mcp?token=abc&token=def')).toBe(
      '/mcp?token=[REDACTED]&token=[REDACTED]'
    );
  });

  it('replaces several sensitive parameters in one URL', () => {
    expect(sanitizeUrl('/x?token=abc&client_secret=shh&apikey=k&page=2')).toBe(
      '/x?token=[REDACTED]&client_secret=[REDACTED]&apikey=[REDACTED]&page=2'
    );
  });

  it('leaves a URL without a query string untouched', () => {
    expect(sanitizeUrl('/mcp')).toBe('/mcp');
  });

  it('leaves an empty query string untouched', () => {
    expect(sanitizeUrl('/mcp?')).toBe('/mcp?');
  });

  it('does not throw on a malformed query string', () => {
    expect(sanitizeUrl('/x?%zz=1&&=&token')).toBe(
      '/x?%zz=1&&=&token=[REDACTED]'
    );
  });

  it('keeps the encoding of values it does not touch', () => {
    expect(sanitizeUrl('/x?path=%2Fhome%3Fa%3Db&token=abc')).toBe(
      '/x?path=%2Fhome%3Fa%3Db&token=[REDACTED]'
    );
  });

  it('works on absolute URLs too', () => {
    expect(sanitizeUrl('https://api.openpanel.dev/mcp?token=abc')).toBe(
      'https://api.openpanel.dev/mcp?token=[REDACTED]'
    );
  });
});
