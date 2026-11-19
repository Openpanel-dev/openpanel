/**
 * `typecheck` across every workspace package that declares one. `bun run --filter` has no `--no-bail` equivalent, so a
 * failing package is recorded and the run continues; stopping at the first failure would silently narrow the gate.
 * The root package is skipped: its own `typecheck` is this script.
 */

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const ROOT_MANIFEST = join(REPO_ROOT, 'package.json');
const TYPECHECK_SCRIPT = 'typecheck';
const DEFAULT_CONCURRENCY = 4;
// `packages/**` must not descend into an installed tree or a build output.
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.output',
]);

interface Workspace {
  directory: string;
  name: string;
}

const readManifest = (path: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

/** `apps/*` / `packages/**` / `tooling/*` — the same globs bun installs from. */
const expandGlob = (pattern: string): string[] => {
  const segments = pattern.split('/');
  let matches = [''];
  for (const segment of segments) {
    const next: string[] = [];
    for (const prefix of matches) {
      let entries: string[] = [];
      try {
        entries = readdirSync(join(REPO_ROOT, prefix)).filter(
          (entry) =>
            !(IGNORED_DIRECTORIES.has(entry) || entry.startsWith('.')) &&
            statSync(join(REPO_ROOT, prefix, entry)).isDirectory()
        );
      } catch {
        continue;
      }
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry}` : entry;
        next.push(path);
        // `**` matches this directory and every directory below it.
        if (segment === '**') {
          next.push(...expandGlob(`${path}/**`));
        }
      }
    }
    matches = segment === '**' ? next : next.filter((path) => path !== '');
    if (segment !== '*' && segment !== '**') {
      matches = matches.filter((path) => path.split('/').pop() === segment);
    }
  }
  return [...new Set(matches)];
};

const workspaces = (): Workspace[] => {
  const root = readManifest(ROOT_MANIFEST);
  const patterns =
    (root?.workspaces as { packages?: string[] } | undefined)?.packages ?? [];
  const found = new Map<string, Workspace>();
  for (const pattern of patterns) {
    for (const directory of expandGlob(pattern)) {
      const manifest = readManifest(join(REPO_ROOT, directory, 'package.json'));
      const scripts = manifest?.scripts as Record<string, string> | undefined;
      if (!scripts?.[TYPECHECK_SCRIPT]) {
        continue;
      }
      found.set(directory, {
        directory,
        name: (manifest?.name as string) ?? directory,
      });
    }
  }
  return [...found.values()].sort((a, b) =>
    a.directory.localeCompare(b.directory)
  );
};

const typecheck = (workspace: Workspace): Promise<boolean> => {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', TYPECHECK_SCRIPT], {
      cwd: join(REPO_ROOT, workspace.directory),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('close', (exitCode) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (exitCode === 0) {
        console.log(`PASS  ${workspace.name} (${seconds}s)`);
        resolve(true);
        return;
      }
      console.log(`FAIL  ${workspace.name} (${seconds}s)`);
      console.log(output.trimEnd());
      resolve(false);
    });
  });
};

const run = async () => {
  const all = workspaces();
  const concurrency = cpus().length || DEFAULT_CONCURRENCY;
  const failures: string[] = [];
  const queue = [...all];

  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (!(await typecheck(next))) {
        failures.push(next.name);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, worker)
  );

  console.log(
    `\ntypecheck: ${all.length - failures.length}/${all.length} passed`
  );
  if (failures.length > 0) {
    console.log(`failed: ${failures.sort().join(', ')}`);
    process.exit(1);
  }
};

await run();
