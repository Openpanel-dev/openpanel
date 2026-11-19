import { describe, expect, it } from 'bun:test';
import { sanitizeUrlQuery } from './sanitize-url';

describe('sanitizeUrlQuery', () => {
  it('replaces a token value and keeps the path', () => {
    expect(sanitizeUrlQuery('/mcp?token=abc123')).toBe('/mcp?token=[REDACTED]');
  });

  it('keeps parameters that are not sensitive', () => {
    expect(sanitizeUrlQuery('/mcp?token=abc123&projectId=proj-1')).toBe(
      '/mcp?token=[REDACTED]&projectId=proj-1'
    );
  });

  it('matches parameter names case-insensitively', () => {
    expect(sanitizeUrlQuery('/mcp?TOKEN=abc&Token=def&accessToken=ghi')).toBe(
      '/mcp?TOKEN=[REDACTED]&Token=[REDACTED]&accessToken=[REDACTED]'
    );
  });

  it('replaces every occurrence of a repeated parameter', () => {
    expect(sanitizeUrlQuery('/mcp?token=abc&token=def')).toBe(
      '/mcp?token=[REDACTED]&token=[REDACTED]'
    );
  });

  it('replaces several sensitive parameters in one URL', () => {
    expect(
      sanitizeUrlQuery('/x?token=abc&client_secret=shh&apikey=k&page=2')
    ).toBe(
      '/x?token=[REDACTED]&client_secret=[REDACTED]&apikey=[REDACTED]&page=2'
    );
  });

  it('leaves a URL without a query string untouched', () => {
    expect(sanitizeUrlQuery('/mcp')).toBe('/mcp');
  });

  it('leaves an empty query string untouched', () => {
    expect(sanitizeUrlQuery('/mcp?')).toBe('/mcp?');
  });

  it('does not throw on a malformed query string', () => {
    expect(sanitizeUrlQuery('/x?%zz=1&&=&token')).toBe(
      '/x?%zz=1&&=&token=[REDACTED]'
    );
  });

  it('keeps the encoding of values it does not touch', () => {
    expect(sanitizeUrlQuery('/x?path=%2Fhome%3Fa%3Db&token=abc')).toBe(
      '/x?path=%2Fhome%3Fa%3Db&token=[REDACTED]'
    );
  });

  it('works on absolute URLs too', () => {
    expect(sanitizeUrlQuery('https://api.openpanel.dev/mcp?token=abc')).toBe(
      'https://api.openpanel.dev/mcp?token=[REDACTED]'
    );
  });
});
