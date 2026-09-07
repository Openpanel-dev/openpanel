/**
 * `check:deps` — dependency-cruiser over `apps/start` and `packages`.
 *
 * Not a plain `bunx`. dependency-cruiser only classifies an edge as
 * `type-only` when it can load the TypeScript compiler, and it resolves
 * `typescript` (its own optional peer) from ITS OWN directory — an ESM lookup,
 * which `NODE_PATH` cannot influence. `pnpm dlx` happened to satisfy that by
 * auto-installing the optional peer into its sandbox; `bunx` and `npx` do not,
 * and neither honours the `NODE_PATH=$PWD/node_modules` the old command set.
 *
 * Measured on this box on 2026-09-07: with `bunx`, `depcruise --info` reports
 * `typescript … -` and the cruise returns 82 false `core-uses-ctx-not-db-internals`
 * violations, every one of them an `import type` line that the rule explicitly
 * allows (`dependencyTypesNot: ['type-only']`). Same tree, same config, via
 * `pnpm dlx`: zero.
 *
 * So the runner installs dependency-cruiser and the pinned TypeScript together,
 * hoisted, into a gitignored cache under `node_modules/`, and runs the tool
 * from there. Both versions are exact: the cruise result must not move because
 * a patch release shipped.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const DEPENDENCY_CRUISER_VERSION = '18.2.0';
const TYPESCRIPT_VERSION = '5.9.3';
const RUNNER_DIR = join(REPO_ROOT, 'node_modules', '.cache', 'depcruise');
const RUNNER_BIN = join(
  RUNNER_DIR,
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruise.mjs'
);
const CRUISE_TARGETS = ['apps/start', 'packages'];
const CONFIG = '.dependency-cruiser.cjs';

const installRunner = () => {
  mkdirSync(RUNNER_DIR, { recursive: true });
  writeFileSync(
    join(RUNNER_DIR, 'package.json'),
    `${JSON.stringify(
      {
        name: 'depcruise-runner',
        private: true,
        dependencies: {
          'dependency-cruiser': DEPENDENCY_CRUISER_VERSION,
          typescript: TYPESCRIPT_VERSION,
        },
      },
      null,
      2
    )}\n`
  );
  // Hoisted, so dependency-cruiser's own directory has `typescript` above it.
  const install = spawnSync(
    'bun',
    ['install', '--linker=hoisted', '--ignore-scripts'],
    { cwd: RUNNER_DIR, stdio: 'inherit' }
  );
  if (install.status !== 0) {
    console.error(
      `check:deps: failed to install the cruiser into ${RUNNER_DIR}`
    );
    process.exit(install.status ?? 1);
  }
};

if (!existsSync(RUNNER_BIN)) {
  installRunner();
}

const cruise = spawnSync(
  'node',
  [RUNNER_BIN, '--config', CONFIG, '--output-type', 'err', ...CRUISE_TARGETS],
  { cwd: REPO_ROOT, stdio: 'inherit' }
);
process.exit(cruise.status ?? 1);
