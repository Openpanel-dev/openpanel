import { describe, expect, it } from 'bun:test';
import { redactConnectionUrls } from './helpers';

describe('redactConnectionUrls', () => {
  it('drops the credentials but keeps host, port and database', () => {
    expect(
      redactConnectionUrls(
        'postgresql://postgres:hunter2@localhost:5432/openpanel?schema=public'
      )
    ).toBe('postgresql://***@localhost:5432/openpanel?schema=public');
  });

  it('redacts credential query params', () => {
    expect(
      redactConnectionUrls(
        'http://ch:8123/openpanel?user=admin&password=s3cr3t'
      )
    ).toBe('http://ch:8123/openpanel?user=***&password=***');
  });

  it('handles the comma-separated ClickHouse list', () => {
    expect(
      redactConnectionUrls(
        'http://a:b@ch1:8123/openpanel,http://a:b@ch2:8123/openpanel'
      )
    ).toBe('http://***@ch1:8123/openpanel,http://***@ch2:8123/openpanel');
  });

  it('says so for an unset or unparseable value', () => {
    expect(redactConnectionUrls(undefined)).toBe('(not set)');
    expect(redactConnectionUrls('')).toBe('(not set)');
    expect(redactConnectionUrls('not a url')).toBe('(unparseable url)');
  });

  it('leaves a credential-free url alone', () => {
    expect(redactConnectionUrls('http://localhost:8123/openpanel')).toBe(
      'http://localhost:8123/openpanel'
    );
  });
});
