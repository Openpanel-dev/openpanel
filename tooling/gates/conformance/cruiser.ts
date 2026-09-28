/**
 * R12 and R22 are delegated to dependency-cruiser, not reimplemented here.
 *
 * Made `dependency-cruiser` a declared root devDependency, verified that it
 * resolves its optional `typescript` peer (the 82-false-violation failure
 * ADR-022 made R22 conditional on), and landed the layer rules
 * in.dependency-cruiser.cjs. So this module runs the cruise and reports its
 * per-rule violation counts. ADR-022's layer-aware fallback in this gate is not
 * in play; a bare `../` depth grep is forbidden either way, because a module
 * importing `defineJob` at `../../jobs/define` is importing DOWNWARD.
 *
 * If the cruise cannot run, that is a hard failure: a delegated check that
 * silently reports zero is worse than no check.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, posix } from 'node:path';
import * as ts from 'typescript';
import { lineOf, type ParsedSource, visit } from './sources';

const CRUISER_BINARY = 'node_modules/.bin/depcruise';
const CRUISER_CONFIG = '.dependency-cruiser.cjs';
/** The same targets `bun run check:deps` cruises. */
const CRUISER_TARGETS = ['apps/start', 'packages'];
const CRUISER_OUTPUT_BYTES = 256 * 1024 * 1024;

export interface CruiserViolation {
  rule: string;
  from: string;
  to: string;
}

export interface CruiserResult {
  available: boolean;
  error?: string;
  violations: CruiserViolation[];
}

export function runCruiser(repoRoot: string): CruiserResult {
  const binary = join(repoRoot, CRUISER_BINARY);
  const run = spawnSync(
    binary,
    [
      '--config',
      CRUISER_CONFIG,
      '--output-type',
      'json',
      '--no-progress',
      ...CRUISER_TARGETS,
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: CRUISER_OUTPUT_BYTES }
  );

  if (run.error || !run.stdout) {
    return {
      available: false,
      error: `${binary} did not run: ${run.error?.message ?? run.stderr?.trim() ?? 'no output'}`,
      violations: [],
    };
  }

  let parsed: {
    summary?: {
      violations?: { rule: { name: string }; from: string; to: string }[];
    };
  };
  try {
    parsed = JSON.parse(run.stdout);
  } catch (error) {
    return {
      available: false,
      error: `could not parse the cruise output: ${(error as Error).message}`,
      violations: [],
    };
  }

  return {
    available: true,
    violations: (parsed.summary?.violations ?? [])
      .map((violation) => ({
        rule: violation.rule.name,
        from: violation.from,
        to: violation.to,
      }))
      .sort(
        (a, b) =>
          a.rule.localeCompare(b.rule) ||
          a.from.localeCompare(b.from) ||
          a.to.localeCompare(b.to)
      ),
  };
}

export function violationsOf(
  result: CruiserResult,
  ruleName: string
): CruiserViolation[] {
  return result.violations.filter((violation) => violation.rule === ruleName);
}

/** The forms a specifier can take once the extension is dropped. */
const RESOLVED_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''];

/**
 * The line of the import that produced a cruiser violation.
 *
 * dependency-cruiser reports an EDGE (`from` -> `to`), not a position, and this
 * gate promises every offender as `file:line`. So the edge is resolved back to
 * the import statement that made it: parse `from`, resolve each relative
 * specifier against its own directory, and take the first one that lands on
 * `to`. Returns 0 when the specifier is not relative (an aliased or package
 * import), which the report renders as a bare path rather than inventing a line.
 */
export function resolveImportLine(source: ParsedSource, to: string): number {
  const directory = dirname(source.path);
  let line = 0;

  visit(source.sourceFile, (node) => {
    if (line > 0) {
      return;
    }
    const specifier = importSpecifierOf(node);
    if (!specifier?.text.startsWith('.')) {
      return;
    }
    const resolved = posix.normalize(posix.join(directory, specifier.text));
    if (RESOLVED_SUFFIXES.some((suffix) => `${resolved}${suffix}` === to)) {
      line = lineOf(source, node.getStart(source.sourceFile));
    }
  });

  return line;
}

function importSpecifierOf(node: ts.Node): ts.StringLiteral | undefined {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier;
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0];
  }
  return undefined;
}
