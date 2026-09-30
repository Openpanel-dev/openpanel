import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Fetcher } from '../src/self-update';
import {
  cachedNewerVersion,
  refreshUpdateCache,
  updateNotice,
} from '../src/update-notice';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const cachePath = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-notice-'));
  tempDirs.push(dir);
  return join(dir, 'nested', 'update-check.json');
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const feed = (version: string): { fetcher: Fetcher; calls: () => number } => {
  let calls = 0;
  return {
    calls: () => calls,
    fetcher: async () => {
      calls++;
      return Response.json([
        {
          tag_name: `v${version}`,
          draft: false,
          prerelease: false,
          assets: [
            {
              name: 'checksums.txt',
              browser_download_url: 'https://example.test/checksums.txt',
            },
          ],
        },
      ]);
    },
  };
};

describe('update notice', () => {
  test('records the latest release, and reports it once it is newer', async () => {
    const path = cachePath();
    await refreshUpdateCache({
      fetcher: feed('0.3.0').fetcher,
      cachePath: path,
      now: NOW,
    });

    expect(cachedNewerVersion('0.1.0', path)).toBe('0.3.0');
    expect(cachedNewerVersion('0.3.0', path)).toBeNull();
    expect(cachedNewerVersion('0.4.0', path)).toBeNull();
  });

  test('looks up at most once a day', async () => {
    const path = cachePath();
    const { fetcher, calls } = feed('0.3.0');

    await refreshUpdateCache({ fetcher, cachePath: path, now: NOW });
    await refreshUpdateCache({
      fetcher,
      cachePath: path,
      now: NOW + DAY_MS - 1,
    });
    expect(calls()).toBe(1);

    await refreshUpdateCache({ fetcher, cachePath: path, now: NOW + DAY_MS });
    expect(calls()).toBe(2);
  });

  test('offline: the attempt is recorded and the last answer is kept', async () => {
    const path = cachePath();
    await refreshUpdateCache({
      fetcher: feed('0.3.0').fetcher,
      cachePath: path,
      now: NOW,
    });

    const offline: Fetcher = async () => {
      throw new Error('network down');
    };
    await refreshUpdateCache({
      fetcher: offline,
      cachePath: path,
      now: NOW + DAY_MS,
    });

    const cache = JSON.parse(readFileSync(path, 'utf8'));
    expect(cache).toEqual({ checkedAt: NOW + DAY_MS, latest: '0.3.0' });
  });

  test('a first-ever failure is also recorded, so it is not retried per command', async () => {
    const path = cachePath();
    const offline: Fetcher = async () => {
      throw new Error('network down');
    };
    await refreshUpdateCache({ fetcher: offline, cachePath: path, now: NOW });

    expect(cachedNewerVersion('0.1.0', path)).toBeNull();
    expect(JSON.parse(readFileSync(path, 'utf8')).checkedAt).toBe(NOW);
  });

  test('a missing or corrupt cache is treated as empty', async () => {
    const path = cachePath();
    expect(cachedNewerVersion('0.1.0', path)).toBeNull();

    await refreshUpdateCache({
      fetcher: feed('0.3.0').fetcher,
      cachePath: path,
      now: NOW,
    });
    writeFileSync(path, '{not json');
    expect(cachedNewerVersion('0.1.0', path)).toBeNull();
  });

  test('the notice names both versions and the command', () => {
    expect(updateNotice('0.1.0', '0.3.0')).toBe(
      'A new openpanel CLI is available: 0.1.0 → 0.3.0. Run `openpanel upgrade`.'
    );
  });
});
