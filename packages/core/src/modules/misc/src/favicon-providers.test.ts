import { describe, expect, it } from 'bun:test';
import type { SafeFetchResult } from '@openpanel/shared/server';
import {
  FAVICON_PROVIDERS,
  fetchProviderIcon,
  isAllowedProviderUrl,
} from './favicon-providers';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function answer(
  status: number,
  body: Buffer | string = '',
  headers: Record<string, string> = {}
): SafeFetchResult {
  return {
    status,
    headers: new Headers(headers),
    body: Buffer.isBuffer(body) ? body : Buffer.from(body),
    finalUrl: '',
    chain: [],
  };
}

/** A fake network: each URL answers from the table; every request is recorded. */
function network(table: Record<string, SafeFetchResult>) {
  const requested: string[] = [];
  const fetch = (url: URL) => {
    requested.push(url.toString());
    const hit = table[url.toString()];
    if (!hit) {
      throw new Error(`unexpected request ${url}`);
    }
    return Promise.resolve(hit);
  };
  return { fetch, requested };
}

describe('isAllowedProviderUrl', () => {
  it('allows the providers and the gstatic redirect hosts over https', () => {
    for (const provider of FAVICON_PROVIDERS) {
      expect(isAllowedProviderUrl(provider('example.com'))).toBe(true);
    }
    expect(
      isAllowedProviderUrl(new URL('https://t2.gstatic.com/faviconV2?x=1'))
    ).toBe(true);
  });

  it('refuses any other host, and plain http', () => {
    for (const url of [
      'https://example.com/favicon.ico',
      'https://evil.gstatic.com.attacker.net/',
      'https://notgstatic.com/',
      'http://icons.duckduckgo.com/ip3/example.com.ico',
      'http://t0.gstatic.com/faviconV2',
    ]) {
      expect([url, isAllowedProviderUrl(new URL(url))]).toEqual([url, false]);
    }
  });
});

describe('fetchProviderIcon', () => {
  const google = new URL('https://www.google.com/s2/favicons?domain=x.com');

  it("follows Google's redirect to gstatic and sniffs the content type", async () => {
    const { fetch, requested } = network({
      [google.toString()]: answer(302, '', {
        location: 'https://t1.gstatic.com/faviconV2?x',
      }),
      'https://t1.gstatic.com/faviconV2?x': answer(200, PNG, {
        'content-type': 'application/octet-stream',
      }),
    });
    const icon = await fetchProviderIcon(google, undefined, fetch);
    expect(icon?.contentType).toBe('image/png');
    expect(requested).toHaveLength(2);
  });

  it('does not connect to a redirect outside the allowed hosts', async () => {
    const { fetch, requested } = network({
      [google.toString()]: answer(302, '', {
        location: 'https://attacker.example/anything.png',
      }),
    });
    expect(await fetchProviderIcon(google, undefined, fetch)).toBeNull();
    expect(requested).toEqual([google.toString()]);
  });

  it('returns null for a non-image body, a 404 and a redirect loop', async () => {
    const html = network({ [google.toString()]: answer(200, '<html/>') });
    expect(await fetchProviderIcon(google, undefined, html.fetch)).toBeNull();

    const missing = network({ [google.toString()]: answer(404) });
    expect(
      await fetchProviderIcon(google, undefined, missing.fetch)
    ).toBeNull();

    const loop = network({
      [google.toString()]: answer(302, '', { location: google.toString() }),
    });
    expect(await fetchProviderIcon(google, undefined, loop.fetch)).toBeNull();
    expect(loop.requested.length).toBeLessThanOrEqual(4);
  });
});
