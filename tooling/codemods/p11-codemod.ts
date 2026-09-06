/**
 * P11 (ADR-008): repoint importers of the four dissolving packages
 * — @openpanel/validation, @openpanel/constants, @openpanel/common,
 * @openpanel/json — at the targets recorded in ./p11-map.json.
 *
 * The map is the single source of truth and is the JSON block of
 * docs/P11_DISSOLUTION_MAP.md verbatim. A row's `to` is the default target;
 * `toByConsumer[<workspace>]` overrides it for one workspace.
 *
 * Three things it does that a sed cannot:
 *  - one import statement fans out to several targets (packages/db/src/types.ts
 *    splits eight ways), so statements are regrouped by target;
 *  - per-symbol `type` keywords are preserved exactly as written. A `type`
 *    keyword can sit on a runtime binding used only in `z.infer<typeof x>`;
 *    dropping it promotes an erased import into a real one and changes the
 *    bundle (ADR-008 risk 4);
 *  - a named re-export (`export { X } from '@openpanel/validation'`) is
 *    rewritten the same way an import is — same clause grammar, same
 *    per-symbol targets.
 *
 * Idempotent: a rewritten specifier no longer matches DYING, so a second run
 * over the same files changes nothing.
 *
 * Usage: bun tooling/codemods/p11-codemod.ts <file...>
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

interface MapRow {
  from: string;
  symbol: string;
  kind: 'type' | 'schema' | 'value';
  to: string;
  keepTypeKeyword: boolean;
  toByConsumer?: Record<string, string>;
}

const REPO_ROOT = resolve(import.meta.dir, '../..');
const MAP: MapRow[] = JSON.parse(
  readFileSync(resolve(import.meta.dir, 'p11-map.json'), 'utf8')
);

const rows = new Map<string, MapRow>();
for (const row of MAP) {
  rows.set(`${row.from}\t${row.symbol}`, row);
}

const DYING = ['validation', 'constants', 'common', 'json']
  .map((name) => `@openpanel/${name}`)
  .join('|');
// Matches both `import { … } from '…'` and the named re-export form
// `export { … } from '…'` — same clause grammar, same per-symbol targets.
const IMPORT_STATEMENT = new RegExp(
  `(import|export)\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*'(${DYING})';`,
  'g'
);

/**
 * `packages/core`, `apps/start`, `packages/sdks/express`, … — the key
 * `toByConsumer` is written in. A fixed segment count breaks on the
 * doubly-nested SDK packages, so this walks up to the nearest package.json.
 */
function workspaceOf(file: string): string {
  let dir = dirname(resolve(REPO_ROOT, file));
  while (dir !== REPO_ROOT && !existsSync(resolve(dir, 'package.json'))) {
    dir = dirname(dir);
  }
  return relative(REPO_ROOT, dir);
}

function targetSpecifier(target: string, file: string): string {
  if (target.startsWith('@openpanel/')) {
    // A core file reaches its siblings by relative path, never through its own
    // package (core-no-self-barrel's reasoning applies to every self-import).
    const selfPrefix = '@openpanel/core/modules/';
    if (
      workspaceOf(file) === 'packages/core' &&
      target.startsWith(selfPrefix)
    ) {
      return relativeTo(
        file,
        `packages/core/src/modules/${target.slice(selfPrefix.length)}.ts`
      );
    }
    return target;
  }
  return relativeTo(file, target);
}

function relativeTo(file: string, repoRelativeTarget: string): string {
  const rel = relative(
    dirname(file),
    resolve(REPO_ROOT, repoRelativeTarget)
  ).replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

interface Binding {
  text: string;
  isType: boolean;
  symbol: string;
}

function parseBindings(clause: string, statementIsType: boolean): Binding[] {
  return clause
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text) => {
      const isType = statementIsType || /^type\s/.test(text);
      const symbol = text
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]!
        .trim();
      return { text: text.replace(/^type\s+/, ''), isType, symbol };
    });
}

function render(
  keyword: string,
  bindings: Binding[],
  specifier: string
): string {
  const allType = bindings.every((b) => b.isType);
  const list = bindings
    .map((b) => (allType || !b.isType ? b.text : `type ${b.text}`))
    .join(', ');
  return `${keyword} ${allType ? 'type ' : ''}{ ${list} } from '${specifier}';`;
}

let changedFiles = 0;
const unmapped: string[] = [];

for (const file of process.argv.slice(2)) {
  const source = readFileSync(file, 'utf8');
  const next = source.replace(
    IMPORT_STATEMENT,
    (statement, keyword, typeKeyword, clause, from) => {
      const byTarget = new Map<string, Binding[]>();
      for (const binding of parseBindings(clause, Boolean(typeKeyword))) {
        const row = rows.get(`${from}\t${binding.symbol}`);
        if (!row || row.to === 'DELETE') {
          unmapped.push(`${file}: ${from} → ${binding.symbol}`);
          return statement;
        }
        const target = row.toByConsumer?.[workspaceOf(file)] ?? row.to;
        const specifier = targetSpecifier(target, file);
        byTarget.set(specifier, [...(byTarget.get(specifier) ?? []), binding]);
      }
      return [...byTarget.entries()]
        .map(([specifier, bindings]) => render(keyword, bindings, specifier))
        .join('\n');
    }
  );
  if (next !== source) {
    writeFileSync(file, next);
    changedFiles++;
  }
}

if (unmapped.length > 0) {
  console.error(`UNMAPPED (left untouched):\n  ${unmapped.join('\n  ')}`);
}
console.log(`rewrote ${changedFiles} file(s)`);
process.exit(unmapped.length > 0 ? 1 : 0);
