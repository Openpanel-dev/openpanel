import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assetName,
  type Fetcher,
  isCompiledBinary,
  isNewer,
  parseChecksums,
  selfUpdate,
} from '../src/self-update';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const NEW_BINARY = 'new-binary-bytes';
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// A fake release feed: one cli release, a binary and its checksums.
const fakeFetcher = (
  options: { tag?: string; checksum?: string } = {}
): Fetcher => {
  const name = assetName('linux', 'x64');
  const base = 'https://example.test';
  const release = {
    tag_name: options.tag ?? 'cli-v0.2.0',
    draft: false,
    prerelease: false,
    assets: [
      { name, browser_download_url: `${base}/${name}` },
      { name: 'checksums.txt', browser_download_url: `${base}/checksums.txt` },
    ],
  };
  return async (url) => {
    if (url.includes('/releases')) {
      return Response.json([
        { tag_name: 'v2.9.0', draft: false, prerelease: false, assets: [] },
        release,
      ]);
    }
    if (url.endsWith('checksums.txt')) {
      return new Response(
        `${options.checksum ?? sha256(NEW_BINARY)}  ${name}\n`
      );
    }
    return new Response(NEW_BINARY);
  };
};

const installedBinary = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-update-'));
  tempDirs.push(dir);
  const path = join(dir, 'openpanel');
  writeFileSync(path, 'old-binary-bytes');
  return path;
};

describe('version helpers', () => {
  test('isNewer compares numerically, not lexically', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
  });

  test('parseChecksums reads sha256sum output', () => {
    const hash = sha256('x');
    const parsed = parseChecksums(
      `${hash}  openpanel-linux-x64\n${hash} *openpanel-darwin-arm64\nnoise\n`
    );
    expect(parsed.get('openpanel-linux-x64')).toBe(hash);
    expect(parsed.get('openpanel-darwin-arm64')).toBe(hash);
    expect(parsed.size).toBe(2);
  });

  test('running under the bun binary is not a compiled install', () => {
    expect(isCompiledBinary('/usr/local/bin/bun')).toBe(false);
    expect(isCompiledBinary('/usr/local/bin/openpanel')).toBe(true);
  });
});

describe('selfUpdate', () => {
  test('replaces the binary when the checksum matches', async () => {
    const execPath = installedBinary();
    const result = await selfUpdate({
      currentVersion: '0.1.0',
      execPath,
      fetcher: fakeFetcher(),
      platform: 'linux',
      arch: 'x64',
    });

    expect(result).toEqual({ status: 'updated', from: '0.1.0', to: '0.2.0' });
    expect(readFileSync(execPath, 'utf8')).toBe(NEW_BINARY);
    expect(existsSync(`${execPath}.new`)).toBe(false);
  });

  test('a checksum mismatch leaves the installed binary untouched', async () => {
    const execPath = installedBinary();
    const fetcher = fakeFetcher({ checksum: sha256('something else') });

    await expect(
      selfUpdate({
        currentVersion: '0.1.0',
        execPath,
        fetcher,
        platform: 'linux',
        arch: 'x64',
      })
    ).rejects.toThrow('Checksum mismatch');
    expect(readFileSync(execPath, 'utf8')).toBe('old-binary-bytes');
    expect(existsSync(`${execPath}.new`)).toBe(false);
  });

  test('already on the latest version does nothing', async () => {
    const execPath = installedBinary();
    const result = await selfUpdate({
      currentVersion: '0.2.0',
      execPath,
      fetcher: fakeFetcher(),
      platform: 'linux',
      arch: 'x64',
    });

    expect(result).toEqual({ status: 'current', version: '0.2.0' });
    expect(readFileSync(execPath, 'utf8')).toBe('old-binary-bytes');
  });

  test('product releases without the cli- prefix are ignored', async () => {
    const execPath = installedBinary();
    const result = await selfUpdate({
      currentVersion: '0.1.0',
      execPath,
      fetcher: fakeFetcher({ tag: 'v9.9.9' }),
      platform: 'linux',
      arch: 'x64',
    });
    expect(result.status).toBe('current');
  });
});
