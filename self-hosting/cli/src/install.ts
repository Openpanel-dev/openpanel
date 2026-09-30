import { existsSync, readFileSync } from 'node:fs';
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

export const isInstallDir = (dir: string): boolean =>
  existsSync(join(dir, COMPOSE_FILE));

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
    hasFile: (relativePath) =>
      files.has(relativePath) || existsSync(join(dir, relativePath)),
  };
};

const EXECUTABLE_MODE = 0o755;

// Originals are kept next to the file as `<name>.bak` so a bad fix is one `mv`
// away from undone. Only files that actually change are touched.
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
    if (previous !== null) {
      await copyFile(target, `${target}.bak`);
    }
    await writeFile(target, content);
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
