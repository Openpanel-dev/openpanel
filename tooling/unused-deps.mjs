#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Lazy import depcheck to avoid hard crash if not installed
async function loadDepcheck() {
  try {
    const mod = await import('depcheck');
    return mod.default ?? mod;
  } catch (err) {
    console.error(
      'depcheck is not installed. Install it with: pnpm -w add -D depcheck',
    );
    process.exitCode = 1;
    process.exit(1);
  }
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_IGNORE_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  '.turbo',
  'coverage',
  '.vercel',
  '.cache',
  '.astro',
  '.pnpm',
];

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    json: args.has('--json') || args.has('-j'),
  };
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readWorkspacePatterns() {
  const workspaceFile = path.join(repoRoot, 'pnpm-workspace.yaml');
  if (!(await fileExists(workspaceFile))) return [];
  const content = await fs.readFile(workspaceFile, 'utf8');
  const patterns = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*"?([^"#]+)"?\s*(?:#.*)?$/);
    if (m) {
      patterns.push(m[1].trim());
    }
  }
  return patterns.filter(Boolean);
}

async function isPackageDir(dir) {
  const pkgPath = path.join(dir, 'package.json');
  return fileExists(pkgPath);
}

async function listSubdirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name));
}

async function findPackagesFromPattern(pattern) {
  // Normalize pattern relative to repo root
  const absolutePattern = path.resolve(repoRoot, pattern);
  if (pattern.endsWith('/**')) {
    const baseDir = absolutePattern.slice(0, -3); // remove /**
    return await findPackagesRecursively(baseDir);
  }
  if (pattern.endsWith('/*')) {
    const baseDir = absolutePattern.slice(0, -2); // remove /*
    return (await listSubdirs(baseDir)).filterAsync(isPackageDir);
  }
  // Direct path
  return (await isPackageDir(absolutePattern)) ? [absolutePattern] : [];
}

async function findPackagesRecursively(startDir) {
  const results = [];
  async function walk(dir) {
    if (!(await fileExists(dir))) return;
    if (await isPackageDir(dir)) results.push(dir);
    const subdirs = await listSubdirs(dir);
    for (const sub of subdirs) {
      await walk(sub);
    }
  }
  await walk(startDir);
  return results;
}

// Add filterAsync utility on arrays
Object.defineProperty(Array.prototype, 'filterAsync', {
  value: async function (predicate) {
    const results = await Promise.all(this.map(predicate));
    return this.filter((_, i) => results[i]);
  },
  enumerable: false,
});

async function discoverWorkspacePackageDirs() {
  const patterns = await readWorkspacePatterns();
  const discovered = new Set();
  for (const pattern of patterns) {
    const pkgs = await findPackagesFromPattern(pattern);
    for (const p of pkgs) discovered.add(path.resolve(p));
  }
  // Always include repo root as well
  discovered.add(repoRoot);
  return Array.from(discovered);
}

async function runDepcheckOnDir(depcheck, dir) {
  const result = await depcheck(dir, {
    ignoreBinPackage: false,
    ignoreDirs: DEFAULT_IGNORE_DIRS,
    ignoreMatches: [],
    specials: [
      depcheck.special.eslint,
      depcheck.special.typescript,
      depcheck.special.webpack,
      depcheck.special.rollup,
      depcheck.special.babel,
      depcheck.special.postcss,
    ],
  });
  return {
    dir,
    unused: {
      dependencies: result.dependencies ?? [],
      devDependencies: result.devDependencies ?? [],
    },
  };
}

function relative(p) {
  return path.relative(repoRoot, p) || '.';
}

function printHuman(results) {
  let any = false;
  for (const { dir, unused } of results) {
    if (unused.dependencies.length + unused.devDependencies.length === 0)
      continue;
    any = true;
    console.log(`\n${relative(dir)}:`);
    if (unused.dependencies.length) {
      console.log(`  unused dependencies (${unused.dependencies.length}):`);
      for (const d of unused.dependencies) console.log(`    - ${d}`);
    }
    if (unused.devDependencies.length) {
      console.log(
        `  unused devDependencies (${unused.devDependencies.length}):`,
      );
      for (const d of unused.devDependencies) console.log(`    - ${d}`);
    }
  }
  if (!any) console.log('No unused dependencies found.');
}

async function main() {
  const args = parseArgs();
  const depcheck = await loadDepcheck();
  const packageDirs = await discoverWorkspacePackageDirs();
  const checks = await Promise.all(
    packageDirs.map((dir) => runDepcheckOnDir(depcheck, dir)),
  );
  if (args.json) {
    const compact = checks
      .map(({ dir, unused }) => ({ dir: relative(dir), ...unused }))
      .filter((r) => r.dependencies.length || r.devDependencies.length);
    console.log(JSON.stringify(compact, null, 2));
  } else {
    printHuman(checks);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
