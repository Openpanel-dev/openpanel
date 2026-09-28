#!/usr/bin/env bun
/**
 * P13 groundwork: pin every declared range to the version `pnpm-lock.yaml`
 * already resolved for it.
 *
 * ADR-014's stop rule ends P13 the moment a pin cannot be reproduced under bun,
 * and bun 1.4.0 cannot read `pnpm-lock.yaml` — it re-resolves the whole graph
 * from the declared ranges. A caret in a manifest is therefore an instruction
 * to a resolver we are about to replace. Writing the resolved version into the
 * manifest turns each range into a fact the next installer has to reproduce
 * rather than a question it gets to answer.
 *
 * For every workspace importer in the lock this rewrites each `dependencies` /
 * `devDependencies` / `optionalDependencies` range in that importer's
 * package.json to the EXACT version the lock resolved FOR THAT IMPORTER, pins
 * every `catalog:` entry in `pnpm-workspace.yaml` the same way, and carries the
 * identical values into the lock's own `specifier:` fields so the tree stays
 * installable with `--frozen-lockfile`.
 *
 * Left alone, deliberately: - `workspace:` / `catalog:` / `npm:` specifiers,
 * which name a resolution strategy rather than a range; - `peerDependencies`,
 * which are compatibility contracts (pnpm's `autoInstallPeers: true` lists them
 * under an importer's `dependencies` in the lock even though the manifest
 * declares them as peers); - the two stale `prisma: ^5.1.1` devDeps ADR-017
 * rule 2 carves out by path (see ADR_017_RULE_2_FROZEN below); - every
 * `version:` field in the lock. NOT ONE RESOLUTION MOVES.
 *
 * Why the lock's specifiers are rewritten here instead of by `pnpm install`: a
 * non-frozen `pnpm install` re-resolves the whole graph and dedupes it. On this
 * tree, on 2026-09-07, that pruned 142 package versions across 135 package
 * names and added none — `@babel/core` collapsing from four copies to two,
 * `magicast` from three to two — which is real resolution movement in the same
 * commit that is supposed to prove nothing moved. Rewriting the specifier
 * fields is the mechanical, resolution-preserving half of what that install
 * would do; `pnpm install --frozen-lockfile` then verifies the result is
 * consistent. The full measurement is in docs/BUN_INSTALL_RECIPE.md § Why the
 * lock is edited, not refreshed.
 *
 * Edits are surgical — only the value on a matched line is replaced — so key
 * order, indentation and every comment survive byte-for-byte, and nothing is
 * written when a file would be unchanged. That is what makes a second run a
 * no-op.
 *
 * Bun run tooling/scripts/pin-from-pnpm-lock.ts bun run
 * tooling/scripts/pin-from-pnpm-lock.ts --check # exit 1 if stale
 */

import { write, YAML } from 'bun';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCKFILE = 'pnpm-lock.yaml';
const WORKSPACE_FILE = 'pnpm-workspace.yaml';

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const;

/** Specifiers that name a resolution strategy rather than a version range. */
const PROTOCOL_SPECIFIER = /^(workspace|catalog|npm|link|file|git|github):/;

/** A resolved version we are willing to write: plain semver, nothing exotic. */
const PLAIN_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z-.]+)?$/;

/**
 * Rule 2 (ACCEPTED) names these two lines by path and rules that the stale
 * `prisma: ^5.1.1` devDeps "are to be **deleted, not aligned to 6.14**" — i.e.
 * touching their version is itself the wrong move, and the deletion belongs to
 * a CLEAN task. Pinning them to the 5.9.1 the lock resolved would be exactly
 * the aligning edit the ADR forbids, so the pinner leaves the manifest entry
 * AND its `specifier:` in the lock alone. Rule 3 is the general P13 pinning
 * permission; rule 2 is a specific, named exception to it.
 */
const ADR_017_RULE_2_FROZEN: ReadonlySet<string> = new Set([
  'packages/redis\tdevDependencies\tprisma',
  'packages/sdks/_info\tdevDependencies\tprisma',
]);

function isFrozenByAdr017Rule2(
  importerPath: string,
  section: string,
  name: string
): boolean {
  return ADR_017_RULE_2_FROZEN.has(`${importerPath}\t${section}\t${name}`);
}

/** The default catalog's name in the lockfile's `catalogs:` map. */
const DEFAULT_CATALOG = 'default';

const EXIT_STALE = 1;

interface LockEntry {
  specifier?: string;
  version?: string;
}
type LockImporter = Partial<Record<string, Record<string, LockEntry>>>;
interface Lockfile {
  importers?: Record<string, LockImporter>;
  catalogs?: Record<string, Record<string, LockEntry>>;
}

/** Every pin the run decided on, keyed for the lockfile rewrite. */
interface Pin {
  importer: string;
  section: string;
  name: string;
  version: string;
}
interface CatalogPin {
  catalog: string;
  name: string;
  version: string;
}

/**
 * pnpm records the peer-resolution suffix inline:
 * `1.4.30(typescript@5.9.3)`, `2.5.2(patch_hash=…)(react@19.2.3)`.
 * The version is everything before the first `(`.
 */
function exactVersion(lockVersion: string | undefined): string | null {
  if (!lockVersion) {
    return null;
  }
  const version = lockVersion.split('(')[0]?.trim() ?? '';
  return PLAIN_VERSION.test(version) ? version : null;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readTextOrNull(relativePath: string): string | null {
  try {
    return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** The `{ … }` slice of `text` that follows `"<section>":`, braces balanced. */
function findSectionBody(
  text: string,
  section: string
): { start: number; end: number } | null {
  const header = new RegExp(`"${section}"\\s*:\\s*\\{`).exec(text);
  if (!header) {
    return null;
  }
  const start = header.index + header[0].length;
  let depth = 1;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return { start, end: index };
      }
    }
  }
  return null;
}

/** Replaces the quoted range of `"<name>": "<range>"` inside one section. */
function pinInSection(
  text: string,
  section: string,
  name: string,
  version: string
): string {
  const body = findSectionBody(text, section);
  if (!body) {
    return text;
  }
  const entry = new RegExp(`("${escapeForRegExp(name)}"\\s*:\\s*")([^"]*)(")`);
  const slice = text.slice(body.start, body.end);
  return (
    text.slice(0, body.start) +
    slice.replace(entry, `$1${version}$3`) +
    text.slice(body.end)
  );
}

function manifestPathOf(importerPath: string): string {
  return importerPath === '.' ? 'package.json' : `${importerPath}/package.json`;
}

function pinManifest(
  importerPath: string,
  importer: LockImporter
): { path: string; text: string; pins: number; targets: Pin[] } | null {
  const relativePath = manifestPathOf(importerPath);
  const original = readTextOrNull(relativePath);
  if (original === null) {
    console.warn(`skip ${relativePath}: no such file`);
    return null;
  }

  const manifest = JSON.parse(original) as Partial<
    Record<string, Record<string, string>>
  >;
  let text = original;
  let pins = 0;
  const targets: Pin[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, entry] of Object.entries(importer[section] ?? {})) {
      const declared = manifest[section]?.[name];
      if (declared === undefined || PROTOCOL_SPECIFIER.test(declared)) {
        continue;
      }
      if (isFrozenByAdr017Rule2(importerPath, section, name)) {
        continue;
      }
      const version = exactVersion(entry.version);
      if (version === null) {
        continue;
      }
      // Recorded whether or not the manifest needs the edit: the lockfile's
      // own specifier has to reach the same value, and an already-pinned
      // manifest beside an unpinned lock is exactly the half-done state
      // `--frozen-lockfile` rejects.
      targets.push({ importer: importerPath, section, name, version });
      if (declared !== version) {
        text = pinInSection(text, section, name, version);
        pins++;
      }
    }
  }

  return targets.length === 0
    ? null
    : { path: relativePath, text, pins, targets };
}

/**
 * `pnpm-workspace.yaml` carries ~90 lines of comments recording the production
 * failure behind each pin, so the catalog is edited line by line rather than
 * re-serialized. Handles the default `catalog:` block and named `catalogs:`.
 */
function pinWorkspaceCatalogs(
  catalogs: Record<string, Record<string, LockEntry>>
): { path: string; text: string; pins: number; targets: CatalogPin[] } | null {
  const original = readTextOrNull(WORKSPACE_FILE);
  if (original === null) {
    return null;
  }

  const lines = original.split('\n');
  const targets: CatalogPin[] = [];
  let pins = 0;
  let catalog: string | null = null;
  let inNamedCatalogs = false;

  for (const [index, line] of lines.entries()) {
    if (/^catalog:\s*$/.test(line)) {
      catalog = DEFAULT_CATALOG;
      inNamedCatalogs = false;
      continue;
    }
    if (/^catalogs:\s*$/.test(line)) {
      catalog = null;
      inNamedCatalogs = true;
      continue;
    }
    if (/^[^\s#]/.test(line)) {
      catalog = null;
      inNamedCatalogs = false;
      continue;
    }
    if (inNamedCatalogs) {
      const named = /^ {2}(?:'([^']+)'|"([^"]+)"|([^\s:]+)):\s*$/.exec(line);
      if (named) {
        catalog = named[1] ?? named[2] ?? named[3] ?? null;
      }
      continue;
    }

    const entry =
      /^(\s+(?:'[^']+'|"[^"]+"|[^\s:]+):[ \t]*)(\S.*?)([ \t]*)$/.exec(line);
    if (catalog === null || !entry) {
      continue;
    }
    const key = /^\s*(?:'([^']+)'|"([^"]+)"|([^\s:]+)):/.exec(line);
    const name = key?.[1] ?? key?.[2] ?? key?.[3];
    if (!name) {
      continue;
    }
    const version = exactVersion(catalogs[catalog]?.[name]?.version);
    if (version === null) {
      continue;
    }
    targets.push({ catalog, name, version });
    if (entry[2] !== version) {
      lines[index] = `${entry[1]}${version}${entry[3]}`;
      pins++;
    }
  }

  return targets.length === 0
    ? null
    : { path: WORKSPACE_FILE, text: lines.join('\n'), pins, targets };
}

/**
 * Carries the manifest and catalog pins into the lock's `specifier:` fields.
 * Every `version:` line is left exactly as it was — this is a relabelling, not
 * a re-resolution. Walks the file as lines because the lock is ~1.4 MB of
 * hand-diffable YAML and a round-trip through a serializer would rewrite all
 * of it.
 */
function pinLockSpecifiers(
  pins: Pin[],
  catalogPins: CatalogPin[]
): { path: string; text: string; pins: number } | null {
  const original = readTextOrNull(LOCKFILE);
  if (original === null) {
    return null;
  }

  const wanted = new Map<string, string>();
  for (const pin of pins) {
    wanted.set(`i\t${pin.importer}\t${pin.section}\t${pin.name}`, pin.version);
  }
  for (const pin of catalogPins) {
    wanted.set(`c\t${pin.catalog}\t${pin.name}`, pin.version);
  }

  const lines = original.split('\n');
  let block: 'importers' | 'catalogs' | 'other' = 'other';
  let scope: string | null = null;
  let section: string | null = null;
  let name: string | null = null;
  const seen = { matched: 0, changed: 0 };

  const unquote = (raw: string) => raw.replace(/^['"]|['"]$/g, '');

  for (const [index, line] of lines.entries()) {
    if (/^[^\s#]/.test(line)) {
      block = line.startsWith('importers:')
        ? 'importers'
        : line.startsWith('catalogs:')
          ? 'catalogs'
          : 'other';
      scope = null;
      section = null;
      name = null;
      continue;
    }
    if (block === 'other' || line.trim() === '') {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const key = /^\s*(.+?):\s*$/.exec(line);

    if (block === 'importers') {
      if (indent === 2 && key) {
        scope = unquote(key[1] as string);
        section = null;
        name = null;
        continue;
      }
      if (indent === 4 && key) {
        section = unquote(key[1] as string);
        name = null;
        continue;
      }
      if (indent === 6 && key) {
        name = unquote(key[1] as string);
        continue;
      }
      if (indent === 8 && scope && section && name) {
        rewriteSpecifier(
          lines,
          index,
          wanted.get(`i\t${scope}\t${section}\t${name}`),
          seen
        );
      }
      continue;
    }

    if (indent === 2 && key) {
      scope = unquote(key[1] as string);
      name = null;
      continue;
    }
    if (indent === 4 && key) {
      name = unquote(key[1] as string);
      continue;
    }
    if (indent === 6 && scope && name) {
      rewriteSpecifier(lines, index, wanted.get(`c\t${scope}\t${name}`), seen);
    }
  }

  // Every pin must have been located, or the lock and the manifests would
  // disagree and `--frozen-lockfile` would reject the tree.
  if (seen.matched !== wanted.size) {
    throw new Error(
      `lockfile rewrite located ${seen.matched} of ${wanted.size} pins — refusing to write a half-updated ${LOCKFILE}`
    );
  }

  return seen.changed === 0
    ? null
    : { path: LOCKFILE, text: lines.join('\n'), pins: seen.changed };
}

/** Replaces `specifier: <range>` in place, counting what it saw and changed. */
function rewriteSpecifier(
  lines: string[],
  index: number,
  version: string | undefined,
  seen: { matched: number; changed: number }
): void {
  if (version === undefined) {
    return;
  }
  const specifier = /^(\s*specifier:\s*)(.*)$/.exec(lines[index] as string);
  if (!specifier) {
    return;
  }
  seen.matched++;
  if (specifier[2] === version) {
    return;
  }
  lines[index] = `${specifier[1]}${version}`;
  seen.changed++;
}

async function main(): Promise<number> {
  const checkOnly = process.argv.includes('--check');
  const lockText = readTextOrNull(LOCKFILE);
  if (lockText === null) {
    console.error(`FAIL: ${LOCKFILE} not found under ${REPO_ROOT}`);
    return EXIT_STALE;
  }
  const lock = YAML.parse(lockText) as Lockfile;

  const writes: Array<{ path: string; text: string; pins: number }> = [];
  const targets: Pin[] = [];

  for (const [importerPath, importer] of Object.entries(
    lock.importers ?? {}
  ).sort(([a], [b]) => a.localeCompare(b))) {
    const manifest = pinManifest(importerPath, importer);
    if (!manifest) {
      continue;
    }
    targets.push(...manifest.targets);
    if (manifest.pins > 0) {
      writes.push({
        path: manifest.path,
        text: manifest.text,
        pins: manifest.pins,
      });
    }
  }

  const workspace = pinWorkspaceCatalogs(lock.catalogs ?? {});
  if (workspace && workspace.pins > 0) {
    writes.push({
      path: workspace.path,
      text: workspace.text,
      pins: workspace.pins,
    });
  }

  const lockWrite = pinLockSpecifiers(targets, workspace?.targets ?? []);
  if (lockWrite) {
    writes.push(lockWrite);
  }

  if (writes.length === 0) {
    console.log('OK: every direct dependency already names its exact version.');
    return 0;
  }

  for (const pending of writes) {
    console.log(
      `${checkOnly ? 'STALE' : 'pinned'} ${String(pending.pins).padStart(4)}  ${pending.path}`
    );
    if (!checkOnly) {
      await write(join(REPO_ROOT, pending.path), pending.text);
    }
  }

  const total = writes.reduce((sum, pending) => sum + pending.pins, 0);
  console.log(
    `${checkOnly ? 'STALE' : 'DONE'}: ${total} specifier(s) across ${writes.length} file(s).`
  );
  return checkOnly ? EXIT_STALE : 0;
}

process.exit(await main());
