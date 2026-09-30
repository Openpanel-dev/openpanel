import { createHash } from 'node:crypto';
import { chmod, rename, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

// CLI releases live next to the product's own, so they are told apart by tag.
const RELEASE_TAG_PREFIX = 'cli-v';
const RELEASES_API =
  process.env.OPENPANEL_RELEASES_API ??
  'https://api.github.com/repos/Openpanel-dev/openpanel/releases?per_page=30';
const CHECKSUMS_ASSET = 'checksums.txt';
const EXECUTABLE_MODE = 0o755;

export type Fetcher = (url: string) => Promise<Response>;

export interface Release {
  version: string;
  assets: Record<string, string>;
}

export const assetName = (platform: string, arch: string): string =>
  `openpanel-${platform}-${arch}`;

// `sha256sum` output: "<hex>  <file>" per line.
export const parseChecksums = (text: string): Map<string, string> => {
  const checksums = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim());
    if (match) {
      checksums.set(match[2] as string, (match[1] as string).toLowerCase());
    }
  }
  return checksums;
};

const parts = (version: string) =>
  version.split('.').map((part) => Number.parseInt(part, 10) || 0);

export const isNewer = (latest: string, current: string): boolean => {
  const a = parts(latest);
  const b = parts(current);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return false;
};

// `bun src/main.ts` runs under the bun binary, which must never overwrite itself.
export const isCompiledBinary = (execPath = process.execPath): boolean =>
  !basename(execPath).toLowerCase().startsWith('bun');

interface ReleaseJson {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

export const fetchLatestRelease = async (
  fetcher: Fetcher
): Promise<Release | null> => {
  const response = await fetcher(RELEASES_API);
  if (!response.ok) {
    throw new Error(`Could not list releases (HTTP ${response.status})`);
  }
  const releases = (await response.json()) as ReleaseJson[];
  const latest = releases.find(
    (release) =>
      release.tag_name.startsWith(RELEASE_TAG_PREFIX) &&
      !release.draft &&
      !release.prerelease
  );
  if (!latest) {
    return null;
  }
  return {
    version: latest.tag_name.slice(RELEASE_TAG_PREFIX.length),
    assets: Object.fromEntries(
      latest.assets.map((asset) => [asset.name, asset.browser_download_url])
    ),
  };
};

export type UpdateResult =
  | { status: 'current'; version: string }
  | { status: 'updated'; from: string; to: string };

interface UpdateOptions {
  currentVersion: string;
  execPath: string;
  fetcher: Fetcher;
  platform?: string;
  arch?: string;
}

// Download, verify, then swap in one rename, so a failed or corrupt download
// can never leave a half-written binary in place.
export const selfUpdate = async ({
  currentVersion,
  execPath,
  fetcher,
  platform = process.platform,
  arch = process.arch,
}: UpdateOptions): Promise<UpdateResult> => {
  const release = await fetchLatestRelease(fetcher);
  if (!(release && isNewer(release.version, currentVersion))) {
    return { status: 'current', version: currentVersion };
  }

  const name = assetName(platform, arch);
  const binaryUrl = release.assets[name];
  const checksumsUrl = release.assets[CHECKSUMS_ASSET];
  if (!(binaryUrl && checksumsUrl)) {
    throw new Error(
      `Release ${release.version} has no ${name} or ${CHECKSUMS_ASSET}`
    );
  }

  const expected = parseChecksums(
    await (await fetcher(checksumsUrl)).text()
  ).get(name);
  const download = await fetcher(binaryUrl);
  if (!(expected && download.ok)) {
    throw new Error(`Could not download ${name} ${release.version}`);
  }
  const bytes = new Uint8Array(await download.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${name}; refusing to install it`);
  }

  const staged = `${execPath}.new`;
  await writeFile(staged, bytes);
  await chmod(staged, EXECUTABLE_MODE);
  await rename(staged, execPath);
  return { status: 'updated', from: currentVersion, to: release.version };
};
