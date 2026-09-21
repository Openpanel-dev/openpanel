/**
 * Source collection and parsing for the conformance checks.
 *
 * Every check takes an array of `ParsedSource` rather than reading the disk
 * itself. That is what makes the checks testable against a fixture string —
 * which is the only way to prove the two miscount traps in
 * docs/CONFORMANCE_GATE_SPEC.md are actually covered.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
// A namespace import rather than ~30 named ones: `ts.isCallExpression` is the
// compiler API's own idiom and reads far better at 30 call sites.
import * as ts from 'typescript';
import { IGNORED_DIRECTORY_NAMES } from './conformance.constants';

export interface ParsedSource {
  /** Repo-relative POSIX path, e.g. `packages/core/src/services.ts`. */
  path: string;
  text: string;
  sourceFile: ts.SourceFile;
}

export interface Offender {
  file: string;
  line: number;
  detail: string;
}

const TYPESCRIPT_FILE_PATTERN = /\.tsx?$/;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.tsx?$/;

const toPosix = (path: string): string => path.split(sep).join('/');

/** Depth-first, name-sorted, so two runs of the gate list files identically. */
export function listSourceFiles(
  repoRoot: string,
  directory: string,
  { includeTests = false }: { includeTests?: boolean } = {}
): string[] {
  const absolute = join(repoRoot, directory);
  const found: string[] = [];

  const descend = (current: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRECTORY_NAMES.has(entry)) {
        continue;
      }
      const child = join(current, entry);
      if (statSync(child).isDirectory()) {
        descend(child);
      } else if (
        TYPESCRIPT_FILE_PATTERN.test(entry) &&
        (includeTests || !TEST_FILE_PATTERN.test(entry))
      ) {
        found.push(toPosix(relative(repoRoot, child)));
      }
    }
  };

  descend(absolute);
  return found;
}

export function parseSource(path: string, text: string): ParsedSource {
  return {
    path,
    text,
    sourceFile: ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      // setParentNodes: the checks need `node.parent` to decide module scope.
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    ),
  };
}

export function readSources(repoRoot: string, paths: string[]): ParsedSource[] {
  return paths.map((path) =>
    parseSource(path, readFileSync(join(repoRoot, path), 'utf8'))
  );
}

/** 1-indexed, the way every editor and every `file:line` offender reads. */
export function lineOf(source: ParsedSource, position: number): number {
  return source.sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

export function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

/**
 * True when `node` is not nested inside any function, method, constructor or
 * class body — i.e. it runs the moment the module is imported. R15 turns on
 * exactly this distinction, and it is the one a grep for `new Redis(` cannot
 * make.
 */
export function isAtModuleScope(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current) ||
      ts.isClassDeclaration(current) ||
      ts.isClassExpression(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

export function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined;
  return Boolean(
    modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

/**
 * Every named function-like declaration: `function f() {}`, `const f = () => {}`
 * and `const f = function () {}`. R3/R6/R10 all count "functions named X", and
 * missing the arrow forms would undercount them the same way the spec's trap 1
 * undercounts factories.
 */
export interface NamedFunction {
  name: string;
  /** Narrow enough that `.parameters` and `.body` are both reachable. */
  declaration:
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction;
  /** The node whose position the offender line is reported at. */
  anchor: ts.Node;
}

export function namedFunctions(source: ParsedSource): NamedFunction[] {
  const functions: NamedFunction[] = [];

  visit(source.sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.push({
        name: node.name.text,
        declaration: node,
        anchor: node.name,
      });
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      functions.push({
        name: node.name.text,
        declaration: node.initializer,
        anchor: node.name,
      });
    }
  });

  return functions;
}

export { ts };
