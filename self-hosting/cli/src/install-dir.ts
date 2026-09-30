import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isInstallDir } from './install';
import { run } from './run';

// Where the old `git clone … && cd openpanel/self-hosting` flow left installs,
// plus the default `init` target.
export const DEFAULT_INSTALL_DIR = join(homedir(), 'openpanel');
const KNOWN_PATHS = [
  DEFAULT_INSTALL_DIR,
  join(DEFAULT_INSTALL_DIR, 'self-hosting'),
  '/opt/openpanel',
  '/opt/openpanel/self-hosting',
];
const OLD_CLONE_SUBDIR = 'self-hosting';

const CONFIG_PATH = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
  'openpanel',
  'config.json'
);

export type DirSource =
  | '--dir'
  | 'OPENPANEL_DIR'
  | 'current directory'
  | './self-hosting'
  | 'remembered'
  | 'running stack'
  | 'known location';

export type Resolution =
  | { kind: 'found'; dir: string; source: DirSource }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'none'; searched: string[] };

export interface ResolveInputs {
  flag?: string;
  envDir?: string;
  cwd: string;
  remembered: string | null;
  runningDirs: string[];
  knownPaths?: string[];
  isInstall?: (dir: string) => boolean;
}

// First match wins, most explicit first. An explicit --dir / OPENPANEL_DIR is
// trusted as given (init creates it); everything after that must actually be
// an OpenPanel install, so a random compose project is never picked up.
export const resolveInstallDir = ({
  flag,
  envDir,
  cwd,
  remembered,
  runningDirs,
  knownPaths = KNOWN_PATHS,
  isInstall = isInstallDir,
}: ResolveInputs): Resolution => {
  if (flag) {
    return { kind: 'found', dir: resolve(flag), source: '--dir' };
  }
  if (envDir) {
    return { kind: 'found', dir: resolve(envDir), source: 'OPENPANEL_DIR' };
  }
  if (isInstall(cwd)) {
    return { kind: 'found', dir: cwd, source: 'current directory' };
  }
  const cloneDir = join(cwd, OLD_CLONE_SUBDIR);
  if (isInstall(cloneDir)) {
    return { kind: 'found', dir: cloneDir, source: './self-hosting' };
  }
  if (remembered && isInstall(remembered)) {
    return { kind: 'found', dir: remembered, source: 'remembered' };
  }

  const running = [...new Set(runningDirs)].filter(isInstall);
  const known = knownPaths.filter(
    (path) => !running.includes(path) && isInstall(path)
  );
  const candidates = [...running, ...known];
  const [only] = candidates;
  if (candidates.length === 1 && only) {
    return {
      kind: 'found',
      dir: only,
      source: running.includes(only) ? 'running stack' : 'known location',
    };
  }
  if (candidates.length > 1) {
    return { kind: 'ambiguous', candidates };
  }
  return {
    kind: 'none',
    searched: [
      cwd,
      cloneDir,
      ...(remembered ? [remembered] : []),
      ...knownPaths,
    ],
  };
};

export const readRememberedDir = (): string | null => {
  try {
    const { installDir } = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as {
      installDir?: string;
    };
    return installDir ?? null;
  } catch {
    return null;
  }
};

// Best effort: failing to remember only means discovery runs next time.
export const rememberDir = async (dir: string): Promise<void> => {
  try {
    await mkdir(dirname(CONFIG_PATH), { recursive: true });
    await writeFile(
      CONFIG_PATH,
      `${JSON.stringify({ installDir: dir }, null, 2)}\n`
    );
  } catch {
    // ignore
  }
};

// Directories of compose projects Docker is running (or has stopped), from
// `docker compose ls`, which knows every project's config file path.
export const runningComposeDirs = async (): Promise<string[]> => {
  const { code, stdout } = await run([
    'docker',
    'compose',
    'ls',
    '--all',
    '--format',
    'json',
  ]);
  if (code !== 0) {
    return [];
  }
  try {
    const projects = JSON.parse(stdout) as { ConfigFiles?: string }[];
    return projects.flatMap(({ ConfigFiles }) =>
      (ConfigFiles ?? '')
        .split(',')
        .filter(Boolean)
        .map((file) => dirname(file))
    );
  } catch {
    return [];
  }
};

export const discoverInstall = async (flag?: string): Promise<Resolution> =>
  resolveInstallDir({
    flag,
    envDir: process.env.OPENPANEL_DIR,
    cwd: process.cwd(),
    remembered: readRememberedDir(),
    runningDirs: await runningComposeDirs(),
  });

// `init` may only write into a directory that is empty or missing.
export const isEmptyOrMissing = (dir: string): boolean =>
  !existsSync(dir) || readdirSync(dir).length === 0;
