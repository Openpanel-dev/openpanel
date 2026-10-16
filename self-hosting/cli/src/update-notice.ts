import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { type Fetcher, fetchLatestRelease, isNewer } from './self-update';
import { yellow } from './ui';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const CHECK_TIMEOUT_MS = 1500;

const DEFAULT_CACHE_PATH = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'),
  'openpanel',
  'update-check.json'
);

interface Cache {
  checkedAt: number;
  latest?: string;
}

const readCache = (cachePath: string): Cache | null => {
  try {
    return existsSync(cachePath)
      ? (JSON.parse(readFileSync(cachePath, 'utf8')) as Cache)
      : null;
  } catch {
    // A corrupt cache is just a stale one.
    return null;
  }
};

const optedOut = () =>
  Boolean(process.env.OPENPANEL_NO_UPDATE_CHECK || process.env.CI);

// Instant: reads what a previous run learned, so the notice never waits on the network.
export const cachedNewerVersion = (
  currentVersion: string,
  cachePath = DEFAULT_CACHE_PATH
): string | null => {
  const latest = readCache(cachePath)?.latest;
  return latest && isNewer(latest, currentVersion) ? latest : null;
};

interface RefreshOptions {
  fetcher: Fetcher;
  cachePath?: string;
  now?: number;
}

// At most one lookup a day. The attempt is recorded even when it fails, so being
// offline costs one short timeout a day instead of one per command.
export const refreshUpdateCache = async ({
  fetcher,
  cachePath = DEFAULT_CACHE_PATH,
  now = Date.now(),
}: RefreshOptions): Promise<void> => {
  const cache = readCache(cachePath);
  if (cache && now - cache.checkedAt < CHECK_INTERVAL_MS) {
    return;
  }
  let latest = cache?.latest;
  try {
    latest = (await fetchLatestRelease(fetcher))?.version ?? latest;
  } catch {
    // keep the previous answer
  }
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({ checkedAt: now, latest }));
};

export const updateNotice = (current: string, latest: string): string =>
  `A new openpanel CLI is available: ${current} → ${latest}. Run \`openpanel upgrade\`.`;

// Prints any known update right away, and returns the background refresh for the
// caller to await (briefly) once its own work is done.
export const startUpdateCheck = (
  currentVersion: string,
  fetcher: Fetcher = (url) =>
    fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
): Promise<void> => {
  if (optedOut() || !process.stderr.isTTY) {
    return Promise.resolve();
  }
  const known = cachedNewerVersion(currentVersion);
  if (known) {
    process.stderr.write(`${yellow(updateNotice(currentVersion, known))}\n`);
  }
  return refreshUpdateCache({ fetcher }).catch(() => undefined);
};
