// Subject moved to @openpanel/shared (M15-010, ADR-022 R21); the suite did
// not follow it. Nothing runs a `test` script in packages/shared yet — the
// root `test` script names its four workspaces explicitly and root
// package.json was outside M15-010's scope — so moving this file would take
// it out of every gate. Move it when that line can gain the filter.
import { describe, expect, it, mock } from 'bun:test';
import {
  assertSafeUrl,
  BlockedUrlError,
  createPinnedAgent,
  createPinnedLookup,
} from '@openpanel/shared/server';

// SELF_HOSTED arrives as `config.selfHosted`; the loader is what decides that
// only `true`/`1` mean self-hosted (`apps/api/src/config/env.test.ts`).
const CLOUD = false;
const SELF_HOSTED = true;

describe('assertSafeUrl', () => {
  it('rejects non-http(s) schemes on the cloud', async () => {
    await expect(assertSafeUrl(CLOUD, 'ftp://example.com')).rejects.toThrow();
  });

  it('rejects malformed URLs', async () => {
    await expect(assertSafeUrl(CLOUD, 'not a url')).rejects.toThrow();
  });

  it('rejects literal private / metadata hosts on the cloud', async () => {
    await expect(assertSafeUrl(CLOUD, 'http://127.0.0.1/x')).rejects.toThrow();
    await expect(assertSafeUrl(CLOUD, 'http://10.0.0.5/x')).rejects.toThrow();
    await expect(
      assertSafeUrl(CLOUD, 'http://169.254.169.254/latest/meta-data/')
    ).rejects.toThrow();
    await expect(assertSafeUrl(CLOUD, 'http://[::1]/x')).rejects.toThrow();
  });

  it('is a no-op on self-hosted (operator controls the network)', async () => {
    await expect(
      assertSafeUrl(SELF_HOSTED, 'http://127.0.0.1/x')
    ).resolves.toBeNull();
  });

  it('returns the validated addresses so the caller can pin to them', async () => {
    // Validating without pinning is check-then-connect: a client that resolves
    // the hostname again can be steered elsewhere by a changed DNS answer.
    await expect(
      assertSafeUrl(CLOUD, 'http://93.184.216.34/x')
    ).resolves.toEqual(['93.184.216.34']);
  });
});

describe('createPinnedLookup', () => {
  it('resolves every hostname to the pinned address', () => {
    const lookup = createPinnedLookup('93.184.216.34');

    const single = mock();
    lookup('anything.example', {}, single);
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);

    const all = mock();
    lookup('anything.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  it('reports IPv6 addresses with the right family', () => {
    const lookup = createPinnedLookup('2606:2800:220:1:248:1893:25c8:1946');
    const cb = mock();
    lookup('anything.example', {}, cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      '2606:2800:220:1:248:1893:25c8:1946',
      6
    );
  });

  it('hands every validated address to an `all` lookup so happy-eyeballs can pick', () => {
    const lookup = createPinnedLookup([
      '2606:2800:220:1:248:1893:25c8:1946',
      '93.184.216.34',
    ]);

    const all = mock();
    lookup('anything.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      { address: '93.184.216.34', family: 4 },
    ]);

    const single = mock();
    lookup('anything.example', {}, single);
    expect(single).toHaveBeenCalledWith(
      null,
      '2606:2800:220:1:248:1893:25c8:1946',
      6
    );
  });

  it('refuses to build a lookup with nothing to pin to', () => {
    expect(() => createPinnedLookup([])).toThrow(BlockedUrlError);
  });
});

describe('createPinnedAgent', () => {
  // Under Bun the bare `undici` specifier resolves to a built-in shim whose
  // Agent has no `close()` and ignores `dispatcher`; that broke every
  // safeFetch call (favicons, OG images) and silently dropped the pinning.
  it('returns a real undici Agent, not the runtime shim', () => {
    const agent = createPinnedAgent('93.184.216.34');
    expect(typeof agent.close).toBe('function');
    expect(typeof agent.destroy).toBe('function');
  });
});
