#!/usr/bin/env bun
/**
 * Writes `tooling/gates/p13-lock-snapshot.json` from `pnpm-lock.yaml`.
 *
 * The snapshot is the reference `tooling/gates/p13-drift.sh` compares an
 * installed tree against. It exists as a separate committed file because
 * once the lock is gone there is nothing left to say what pnpm had
 * resolved, and "did the installer swap move anything?" becomes
 * unanswerable. This file outlives the lock.
 *
 * Shape: { "<importer path>": { "<dependency>": "<exact version>" } }
 *
 * Every direct dependency of every workspace importer — `dependencies`,
 * `devDependencies` and `optionalDependencies` alike, registry copies and
 * `workspace:` links alike. Links are recorded at the linked package's own
 * `version`, which is what a correctly-linked `node_modules/<dep>/package.json`
 * reports; that is deliberate, because a resolver silently preferring the
 * REGISTRY copy of a workspace package over the local one is a real hazard here
 * (`apps/start` depends on `@openpanel/web@1.0.5` from npm while the workspace
 * source is 1.4.1-local) and the gate should see it.
 *
 * Bun run tooling/scripts/write-p13-lock-snapshot.ts
 */

import { file, write, YAML } from 'bun';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCKFILE = join(REPO_ROOT, 'pnpm-lock.yaml');
const SNAPSHOT = join(REPO_ROOT, 'tooling/gates/p13-lock-snapshot.json');

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const;

const LINK_PREFIX = 'link:';

interface LockEntry {
  specifier?: string;
  version?: string;
}
interface Lockfile {
  importers?: Record<
    string,
    Partial<Record<string, Record<string, LockEntry>>>
  >;
}

/** `1.4.30(typescript@5.9.3)` and `2.5.2(patch_hash=…)(…)` both mean `x.y.z`. */
function registryVersion(lockVersion: string): string {
  return lockVersion.split('(')[0]?.trim() ?? '';
}

/** A `link:` target's version is the linked workspace package's own version. */
function linkedVersion(
  importerPath: string,
  lockVersion: string
): string | null {
  const target = normalize(
    join(
      importerPath === '.' ? '.' : importerPath,
      lockVersion.slice(LINK_PREFIX.length)
    )
  );
  try {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, target, 'package.json'), 'utf8')
    ) as { version?: string };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}

const lock = YAML.parse(await file(LOCKFILE).text()) as Lockfile;
const snapshot: Record<string, Record<string, string>> = {};

for (const importerPath of Object.keys(lock.importers ?? {}).sort()) {
  const importer = lock.importers?.[importerPath] ?? {};
  const direct: Record<string, string> = {};

  for (const section of DEPENDENCY_SECTIONS) {
    for (const name of Object.keys(importer[section] ?? {}).sort()) {
      const lockVersion = importer[section]?.[name]?.version;
      if (!lockVersion) {
        continue;
      }
      const version = lockVersion.startsWith(LINK_PREFIX)
        ? linkedVersion(importerPath, lockVersion)
        : registryVersion(lockVersion);
      if (version) {
        direct[name] = version;
      }
    }
  }

  snapshot[importerPath] = Object.fromEntries(
    Object.entries(direct).sort(([a], [b]) => (a < b ? -1 : 1))
  );
}

await write(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);

const total = Object.values(snapshot).reduce(
  (sum, deps) => sum + Object.keys(deps).length,
  0
);
console.log(
  `wrote ${SNAPSHOT}: ${Object.keys(snapshot).length} importers, ${total} direct dependencies.`
);
