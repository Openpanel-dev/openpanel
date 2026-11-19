import { existsSync, readFileSync, statSync } from 'node:fs';
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseDocument } from 'yaml';
import type { Install } from './doctor/types';
import { EnvFile } from './env-file';

const COMPOSE_FILE = 'docker-compose.yml';
const ENV_FILE = '.env';
const CADDYFILE = 'caddy/Caddyfile';
// Keep the user's formatting: no padding inside [..], no re-folding of long lines.
const YAML_OUTPUT = { flowCollectionPadding: false, lineWidth: 0 } as const;

const readIfExists = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;

// Services every OpenPanel stack has. A compose file without them is some other
// project, notably the repo's own dev docker-compose.yml in a git clone.
const SIGNATURE_SERVICES = ['op-api', 'op-dashboard'] as const;

export const isInstallDir = (dir: string): boolean => {
  const text = readIfExists(join(dir, COMPOSE_FILE));
  if (text === null) {
    return false;
  }
  try {
    const compose = parseDocument(text);
    return SIGNATURE_SERVICES.every((service) =>
      compose.hasIn(['services', service])
    );
  } catch {
    return false;
  }
};

export const loadInstall = (dir: string): Install => {
  const composeText = readIfExists(join(dir, COMPOSE_FILE));
  if (composeText === null) {
    throw new Error(
      `No ${COMPOSE_FILE} in ${dir}. Run \`openpanel init\` first.`
    );
  }
  const files = new Map<string, string>();
  return {
    compose: parseDocument(composeText),
    env: new EnvFile(readIfExists(join(dir, ENV_FILE)) ?? ''),
    caddyfile: readIfExists(join(dir, CADDYFILE)),
    files,
    fileKind: (relativePath) => {
      if (files.has(relativePath)) {
        return 'file';
      }
      const path = join(dir, relativePath);
      if (!existsSync(path)) {
        return 'missing';
      }
      return statSync(path).isDirectory() ? 'directory' : 'file';
    },
  };
};

const EXECUTABLE_MODE = 0o755;
// .env holds the encryption key, cookie secret and admin password.
const SECRET_MODE = 0o600;

const isSecretFile = (relativePath: string) => relativePath === ENV_FILE;

// The first backup is `<name>.bak`; later ones get a timestamp, so running a
// fix twice never overwrites the only copy of the original.
const backupPath = (target: string): string => {
  const plain = `${target}.bak`;
  if (!existsSync(plain)) {
    return plain;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${target}.bak.${stamp}`;
};

// Only files that actually change are touched.
export const writeFiles = async (
  dir: string,
  outputs: Map<string, string>
): Promise<string[]> => {
  const written: string[] = [];
  for (const [relativePath, content] of outputs) {
    const target = join(dir, relativePath);
    const previous = readIfExists(target);
    if (previous === content) {
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    const secret = isSecretFile(relativePath);
    if (previous !== null) {
      const backup = backupPath(target);
      await copyFile(target, backup);
      if (secret) {
        await chmod(backup, SECRET_MODE);
      }
    }
    await writeFile(
      target,
      content,
      secret ? { mode: SECRET_MODE } : undefined
    );
    // writeFile keeps an existing file's mode, so tighten it explicitly.
    if (secret) {
      await chmod(target, SECRET_MODE);
    }
    if (relativePath.endsWith('.sh')) {
      await chmod(target, EXECUTABLE_MODE);
    }
    written.push(relativePath);
  }
  return written;
};

export const writeInstall = (
  dir: string,
  install: Install
): Promise<string[]> =>
  writeFiles(
    dir,
    new Map<string, string>([
      [COMPOSE_FILE, install.compose.toString(YAML_OUTPUT)],
      [ENV_FILE, install.env.toString()],
      ...(install.caddyfile === null
        ? []
        : ([[CADDYFILE, install.caddyfile]] as const)),
      ...install.files,
    ])
  );
