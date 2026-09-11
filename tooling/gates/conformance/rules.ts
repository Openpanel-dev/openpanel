/**
 * The ADR-022 conformance checks.
 *
 * Every check is a pure function over already-parsed sources, so the gate's own
 * tests can run it against a fixture string. That is not decoration: the two
 * miscount traps in docs/CONFORMANCE_GATE_SPEC.md can only be proven covered by
 * feeding a check a source that contains them.
 *
 * Where a grep would lie, the check walks the TypeScript AST:
 *
 *   R3   a factory signature can span lines, so the argument list is not on the
 *        `export function` line. `rg 'create[A-Za-z]+Service\(deps'` saw 28 of
 *        36 on 2026-09-08.
 *   R5   `ReturnType<typeof create` appears once in services.ts and the match is
 *        a COMMENT (services.ts:154) explaining the circularity rule. The
 *        pattern is applied in code zero times.
 *   R6   `createServices(` in a comment or a string is not a call site.
 *   R7   `rg 'process\.env\.'` both over- and under-counts: rpc/base.ts:246 is a
 *        comment saying core reads no process.env, and get-client-ip.ts:83 is a
 *        real read written `process.env?.` that the pattern misses.
 *   R15  `new Redis(` inside a factory body is exactly what core is supposed to
 *        do; at module scope it is the violation. Only scope tells them apart.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  ACCESS_CHECK_FUNCTION_NAMES,
  ASSET_LOADER_ALLOWLIST,
  AUTH_STACK_PATHS,
  CONNECTION_CONSTRUCTOR_NAMES,
  CONNECTION_FACTORY_NAME_PATTERN,
  CORE_SERVICES_FILE,
  CORE_SOURCE_ROOT,
  NEXT_PUBLIC_ALLOWED_ROOT,
  NEXT_PUBLIC_PREFIX,
  RESIDUE_PATTERNS,
  SANCTIONED_CREATE_SERVICES_SITES,
  SHARED_PACKAGE_NAME,
  SHARED_PACKAGE_ROOT,
  UTIL_BASENAME_ALIASES,
  UTIL_BASENAME_EXCLUSIONS,
  UTIL_DIRECTORY_PATTERNS,
} from './conformance.constants';
import {
  isAtModuleScope,
  isExported,
  lineOf,
  namedFunctions,
  type NamedFunction,
  type Offender,
  type ParsedSource,
  ts,
  visit,
} from './sources';

export interface Metric {
  label: string;
  count: number;
  /** `null` marks a reported-only metric: it has no pass/fail line. */
  target: number | null;
  offenders: Offender[];
  note?: string;
}

const SERVICE_FACTORY_NAME = /^create[A-Z][A-Za-z]*Service$/;
const SERVICE_INTERFACE_NAME = /^[A-Z][A-Za-z]*Service$/;
const DEPENDENCY_LOADER_NAME = /^load[A-Z]/;
const SERVICE_DEPS_TYPE = 'ServiceDeps';
const SERVICES_TYPE = 'Services';
const SERVICES_INTERFACE_NAME = 'Services';
const CREATE_SERVICES_CALLEE = 'createServices';
const MODULE_ROOT_FILE = /^([a-z0-9-]+)\.(rpc|service|routes|jobs|constants)\.tsx?$/;

const byFileThenLine = (a: Offender, b: Offender): number =>
  a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1;

const sorted = (offenders: Offender[]): Offender[] =>
  [...offenders].sort(byFileThenLine);

const isUnder = (path: string, roots: readonly string[]): boolean =>
  roots.some((root) => path === root || path.startsWith(root));

// --- R3 -----------------------------------------------------------------------

const typeText = (node: ts.TypeNode | undefined): string =>
  node ? node.getText().replace(/\s+/g, ' ') : '<untyped>';

/** `services: () => Services`, in any of the ways that can be written. */
const isServicesThunk = (
  parameter: ts.ParameterDeclaration
): boolean => {
  const type = parameter.type;
  if (!(type && ts.isFunctionTypeNode(type))) {
    return false;
  }
  return (
    type.parameters.length === 0 &&
    ts.isTypeReferenceNode(type.type) &&
    type.type.typeName.getText() === SERVICES_TYPE
  );
};

const isServiceDeps = (
  parameter: ts.ParameterDeclaration
): boolean =>
  Boolean(
    parameter.type &&
      ts.isTypeReferenceNode(parameter.type) &&
      parameter.type.typeName.getText() === SERVICE_DEPS_TYPE
  );

export function serviceFactories(sources: ParsedSource[]): {
  source: ParsedSource;
  fn: NamedFunction;
}[] {
  const factories: { source: ParsedSource; fn: NamedFunction }[] = [];
  for (const source of sources) {
    for (const fn of namedFunctions(source)) {
      if (SERVICE_FACTORY_NAME.test(fn.name)) {
        factories.push({ source, fn });
      }
    }
  }
  return factories;
}

/** R3 — every factory is `(deps: ServiceDeps, services: () => Services)`. */
export function checkFactorySignatures(sources: ParsedSource[]): Metric {
  const factories = serviceFactories(sources);
  const offenders: Offender[] = [];

  for (const { source, fn } of factories) {
    const parameters = fn.declaration.parameters;
    const hasDeps = parameters.length >= 1 && isServiceDeps(parameters[0]);
    const hasThunk = parameters.length >= 2 && isServicesThunk(parameters[1]);
    if (hasDeps && hasThunk && parameters.length === 2) {
      continue;
    }

    const signature = parameters
      .map((parameter) => `${parameter.name.getText()}: ${typeText(parameter.type)}`)
      .join(', ');
    const missing = hasThunk
      ? 'first parameter is not ServiceDeps'
      : 'missing the `services: () => Services` thunk';
    offenders.push({
      file: source.path,
      line: lineOf(source, fn.anchor.getStart(source.sourceFile)),
      detail: `${fn.name}(${signature}) — ${missing}`,
    });
  }

  return {
    label: `createXService factories whose signature is not (deps: ServiceDeps, services: () => Services) — ${offenders.length} of ${factories.length}`,
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
  };
}

// --- R5 -----------------------------------------------------------------------

/** R5a — no hand-written `export interface XService` outside services.ts. */
export function checkServiceInterfaces(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];

  for (const source of sources) {
    if (source.path === CORE_SERVICES_FILE) {
      continue;
    }
    visit(source.sourceFile, (node) => {
      if (
        ts.isInterfaceDeclaration(node) &&
        isExported(node) &&
        SERVICE_INTERFACE_NAME.test(node.name.text)
      ) {
        offenders.push({
          file: source.path,
          line: lineOf(source, node.name.getStart(source.sourceFile)),
          detail: `export interface ${node.name.text} — R5 types a service by ReturnType<typeof create${node.name.text}>, not by hand`,
        });
      }
    });
  }

  return {
    label: 'hand-written `export interface XService` outside services.ts',
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
  };
}

const isReturnTypeOfFactory = (
  type: ts.TypeNode | undefined
): boolean => {
  if (!(type && ts.isTypeReferenceNode(type))) {
    return false;
  }
  if (type.typeName.getText() !== 'ReturnType') {
    return false;
  }
  const argument = type.typeArguments?.[0];
  return Boolean(
    argument &&
      ts.isTypeQueryNode(argument) &&
      SERVICE_FACTORY_NAME.test(argument.exprName.getText())
  );
};

/**
 * R5b — every member of the `Services` interface is typed
 * `ReturnType<typeof createXService>`, IN CODE.
 *
 * The trap: `rg -o 'ReturnType<typeof create' packages/core/src/services.ts`
 * returns 1, and that match is the comment at services.ts:154 explaining why
 * `ReturnType<typeof createServices>` is circular. The AST never sees a comment,
 * so this counts 0 today, which is the true number.
 */
export function checkServicesMembers(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];
  let members = 0;
  let conforming = 0;

  for (const source of sources) {
    visit(source.sourceFile, (node) => {
      if (
        !(
          ts.isInterfaceDeclaration(node) &&
          node.name.text === SERVICES_INTERFACE_NAME
        )
      ) {
        return;
      }
      for (const member of node.members) {
        if (!ts.isPropertySignature(member)) {
          continue;
        }
        members++;
        if (isReturnTypeOfFactory(member.type)) {
          conforming++;
          continue;
        }
        offenders.push({
          file: source.path,
          line: lineOf(source, member.getStart(source.sourceFile)),
          detail: `${member.name.getText()}: ${typeText(member.type)} — R5 wants ReturnType<typeof createXService>`,
        });
      }
    });
  }

  return {
    label: `Services members typed ReturnType<typeof createXService> in code (not comments) — ${conforming} of ${members}`,
    // The metric ADR-022's baseline states is the number of CONFORMING members;
    // the assert target is that every member conforms.
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
    note: `${conforming} conforming member(s) of ${members}; baseline 2026-09-08 was 0`,
  };
}

// --- R6 -----------------------------------------------------------------------

/** R6a — `createServices(` only at the sanctioned construction sites. */
export function checkCreateServicesCallSites(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];

  for (const source of sources) {
    if (isUnder(source.path, SANCTIONED_CREATE_SERVICES_SITES)) {
      continue;
    }
    visit(source.sourceFile, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === CREATE_SERVICES_CALLEE
      ) {
        offenders.push({
          file: source.path,
          line: lineOf(source, node.getStart(source.sourceFile)),
          detail:
            'createServices( outside the five sanctioned construction sites (ADR-022 R15)',
        });
      }
    });
  }

  return {
    label:
      'files calling createServices( outside services.ts / context.ts / http/define.ts / jobs/workers.ts / apps/api/src/main.ts',
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
  };
}

const allowedAssetLoader = (
  file: string,
  functionName: string
): { reason: string } | undefined =>
  ASSET_LOADER_ALLOWLIST.find(
    (entry) => entry.file === file && entry.functionName === functionName
  );

/**
 * R6b — no `load*` dependency loaders.
 *
 * The carve-out is the explicit ASSET_LOADER_ALLOWLIST, not a pattern: a loader
 * that reads a MaxMind database or a cursor row is loading DATA, and ADR-022
 * allows it. A loader that lazily imports a sibling service or a db/ch/redis
 * handle the caller already holds is the defect. Since nothing in the source
 * text reliably separates the two, the gate refuses to guess — a new loader has
 * to be added to the allowlist by hand, with a reason, in a diff a reviewer
 * reads.
 */
export function checkDependencyLoaders(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];
  let total = 0;
  const allowed: Offender[] = [];

  for (const source of sources) {
    for (const fn of namedFunctions(source)) {
      if (!DEPENDENCY_LOADER_NAME.test(fn.name)) {
        continue;
      }
      total++;
      const line = lineOf(source, fn.anchor.getStart(source.sourceFile));
      const carveOut = allowedAssetLoader(source.path, fn.name);
      if (carveOut) {
        allowed.push({
          file: source.path,
          line,
          detail: `${fn.name} — allowlisted asset loader: ${carveOut.reason}`,
        });
        continue;
      }
      offenders.push({
        file: source.path,
        line,
        detail: `${fn.name} — a lazy loader; R6 says the graph is rebuilt per unit of work and reached through deps/ctx`,
      });
    }
  }

  return {
    label: `load* dependency loaders, excluding the ${ASSET_LOADER_ALLOWLIST.length} allowlisted asset loaders — ${offenders.length} of ${total} load* functions`,
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
    note: sorted(allowed)
      .map((entry) => `allowlisted: ${entry.file}:${entry.line} ${entry.detail}`)
      .join('\n'),
  };
}

// --- R7 -----------------------------------------------------------------------

const isProcessEnv = (node: ts.Node): boolean =>
  ts.isPropertyAccessExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'process' &&
  node.name.text === 'env';

export interface EnvReadSplit {
  dotted: Offender[];
  bracketed: Offender[];
}

/** R7 — every `process.env` read in core, split by the form it is written in. */
export function collectEnvReads(sources: ParsedSource[]): EnvReadSplit {
  const dotted: Offender[] = [];
  const bracketed: Offender[] = [];

  for (const source of sources) {
    visit(source.sourceFile, (node) => {
      if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
        dotted.push({
          file: source.path,
          line: lineOf(source, node.getStart(source.sourceFile)),
          detail: `process.env.${node.name.text}`,
        });
        return;
      }
      if (ts.isElementAccessExpression(node) && isProcessEnv(node.expression)) {
        bracketed.push({
          file: source.path,
          line: lineOf(source, node.getStart(source.sourceFile)),
          detail: `process.env[${node.argumentExpression.getText()}]`,
        });
      }
    });
  }

  return { dotted: sorted(dotted), bracketed: sorted(bracketed) };
}

export function checkEnvReads(sources: ParsedSource[]): Metric[] {
  const { dotted, bracketed } = collectEnvReads(sources);
  const dottedFiles = new Set(dotted.map((offender) => offender.file));
  const bracketedFiles = new Set(bracketed.map((offender) => offender.file));
  const allFiles = new Set([...dottedFiles, ...bracketedFiles]);

  return [
    {
      label: `process.env.<name> reads in packages/core/src (non-test) — across ${dottedFiles.size} files`,
      count: dotted.length,
      target: 0,
      offenders: dotted,
      note:
        'ADR-022 baseline 2026-09-08: 172 occurrences across 50 files, measured with `rg process\\.env\\.`.\n' +
        "That grep's file count is one high: rpc/base.ts:246 is a COMMENT saying core reads no process.env,\n" +
        'and it misses shared/get-client-ip.ts:83, a real read written `process.env?.`. The two errors cancel\n' +
        'in the occurrence count and do not in the file count, so the AST reads 172 across 49 files.',
    },
    {
      label: `process.env[...] reads in packages/core/src (non-test) — across ${bracketedFiles.size} files`,
      count: bracketed.length,
      target: 0,
      offenders: bracketed,
      note:
        'The bracketed form is the same violation and no grep for `process.env.` sees it.\n' +
        `Both forms together: ${dotted.length + bracketed.length} reads across ${allFiles.size} files. R7's target is 0 of either.`,
    },
  ];
}

// --- R10 ----------------------------------------------------------------------

/** R10 — the access checks live in the auth service and the builders only. */
export function checkAccessChecks(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];

  for (const source of sources) {
    if (isUnder(source.path, AUTH_STACK_PATHS)) {
      continue;
    }
    for (const fn of namedFunctions(source)) {
      if (!ACCESS_CHECK_FUNCTION_NAMES.has(fn.name)) {
        continue;
      }
      offenders.push({
        file: source.path,
        line: lineOf(source, fn.anchor.getStart(source.sourceFile)),
        detail: `${fn.name} — R10 keeps access checks in the auth service and rpc/base.ts; protectedProcedure already enforces login`,
      });
    }
  }

  return {
    label:
      'require(Login|ReadAccess|WriteAccess|Access) definitions outside rpc/base.ts and modules/auth/',
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
  };
}

// --- R14 ----------------------------------------------------------------------

export interface ResidueScanInput {
  path: string;
  text: string;
}

/**
 * R14 — dead prefixes and dead names.
 *
 * Deliberately a TEXT scan, not an AST one: residue in a comment is still
 * residue, and `NEXT_PUBLIC_` most often survives inside a string or a doc line.
 */
export function checkResidue(files: ResidueScanInput[]): Metric[] {
  const metrics: Metric[] = [];

  for (const { label, pattern } of RESIDUE_PATTERNS) {
    const offenders: Offender[] = [];
    const global = new RegExp(pattern.source, `${pattern.flags}g`);

    for (const file of files) {
      if (
        pattern.source.includes(NEXT_PUBLIC_PREFIX) &&
        file.path.startsWith(NEXT_PUBLIC_ALLOWED_ROOT)
      ) {
        continue;
      }
      const lines = file.text.split('\n');
      for (const [index, line] of lines.entries()) {
        global.lastIndex = 0;
        const matches = line.match(global);
        if (!matches) {
          continue;
        }
        for (const match of matches) {
          offenders.push({
            file: file.path,
            line: index + 1,
            detail: `${match} — ${line.trim().slice(0, 100)}`,
          });
        }
      }
    }

    // ADR-022's baseline states NEXT_PUBLIC_ for packages/core/src on its own
    // (10 across 10 files); the rest of the tree is a second, wider metric. Both
    // are asserted, so splitting them costs nothing and keeps the baseline
    // number reproducible line-for-line.
    if (pattern.source.includes(NEXT_PUBLIC_PREFIX)) {
      const inCore = offenders.filter((offender) =>
        offender.file.startsWith(`${CORE_SOURCE_ROOT}/`)
      );
      const elsewhere = offenders.filter(
        (offender) => !offender.file.startsWith(`${CORE_SOURCE_ROOT}/`)
      );
      const coreFiles = new Set(inCore.map((offender) => offender.file));
      metrics.push({
        label: `${label} occurrences in ${CORE_SOURCE_ROOT} — across ${coreFiles.size} files`,
        count: inCore.length,
        target: 0,
        offenders: sorted(inCore),
      });
      metrics.push({
        label: `${label} occurrences elsewhere outside ${NEXT_PUBLIC_ALLOWED_ROOT}`,
        count: elsewhere.length,
        target: 0,
        offenders: sorted(elsewhere),
      });
      continue;
    }

    metrics.push({
      label: `${label} occurrences`,
      count: offenders.length,
      target: 0,
      offenders: sorted(offenders),
    });
  }

  return metrics;
}

// --- R15 ----------------------------------------------------------------------

/**
 * The name a `new` expression actually constructs, however it is qualified.
 *
 * `new GitHub(...)` is an identifier; `new Arctic.Google(...)` is a property
 * access, and an `ts.isIdentifier` guard cannot see it at all — the checker
 * would walk straight past a namespace-imported client
 * (CONFORMANCE_PLAN.md §1l). Both spellings construct the same thing, so both
 * resolve to the rightmost name here.
 */
function constructedName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return undefined;
}

/**
 * R15 — core declares, the app constructs. Nothing in core opens a socket,
 * connection or client at import time.
 *
 * Scope is the whole check: `new S3Client({...})` inside `createS3Adapter` is
 * correct; the same line at module scope is the violation. A grep sees one
 * thing.
 */
export function checkModuleScopeConstruction(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];

  for (const source of sources) {
    visit(source.sourceFile, (node) => {
      if (!isAtModuleScope(node)) {
        return;
      }
      if (ts.isNewExpression(node)) {
        const constructed = constructedName(node.expression);
        if (constructed && CONNECTION_CONSTRUCTOR_NAMES.has(constructed)) {
          offenders.push({
            file: source.path,
            line: lineOf(source, node.getStart(source.sourceFile)),
            detail: `new ${node.expression.getText(source.sourceFile)}( at module scope`,
          });
          // Only a MATCH stops the walk: `new Wrapper(new Redis())` must
          // still reach the inner construction.
          return;
        }
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        CONNECTION_FACTORY_NAME_PATTERN.test(node.expression.text)
      ) {
        offenders.push({
          file: source.path,
          line: lineOf(source, node.getStart(source.sourceFile)),
          detail: `${node.expression.text}( at module scope`,
        });
      }
    });
  }

  return {
    label:
      'connection/client construction at module scope in packages/core/src (non-test)',
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
  };
}

// --- R21 ----------------------------------------------------------------------

const utilKey = (path: string): string | undefined => {
  if (!UTIL_DIRECTORY_PATTERNS.some((pattern) => pattern.test(path))) {
    return undefined;
  }
  const name = basename(path).replace(/\.tsx?$/, '');
  if (UTIL_BASENAME_EXCLUSIONS.has(name)) {
    return undefined;
  }
  return UTIL_BASENAME_ALIASES.get(name) ?? name;
};

/**
 * R21 — nothing is copied between packages to dodge a dependency edge.
 *
 * The count is duplicate COPIES, not colliding names: one file per group is the
 * canonical one and the rest are the copies to delete. ADR-022's expected end
 * state says "5 duplicate util copies deleted", which is this number.
 */
export function checkDuplicateUtilities(paths: string[]): Metric {
  const groups = new Map<string, string[]>();

  for (const path of paths) {
    const key = utilKey(path);
    if (!key) {
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(path);
    groups.set(key, group);
  }

  const offenders: Offender[] = [];
  for (const [key, members] of [...groups.entries()].sort()) {
    if (members.length < 2) {
      continue;
    }
    const [canonical, ...copies] = members.sort();
    for (const copy of copies) {
      offenders.push({
        file: copy,
        line: 1,
        detail: `duplicates ${canonical} (util "${key}") — R21 moves the shared version to ${SHARED_PACKAGE_NAME}`,
      });
    }
  }

  return {
    label: 'duplicate util copies across apps/* and packages/*',
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
  };
}

/** R21 — `@openpanel/shared` imports no workspace package. */
export function checkSharedPackageIsolation(repoRoot: string): Metric {
  const manifest = join(repoRoot, SHARED_PACKAGE_ROOT, 'package.json');
  if (!existsSync(manifest)) {
    return {
      label: `workspace dependencies declared by ${SHARED_PACKAGE_NAME}`,
      count: 0,
      target: 0,
      offenders: [],
      note: `${SHARED_PACKAGE_ROOT} does not exist yet — ADR-022's C7 chore creates it. Nothing to check.`,
    };
  }

  const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const offenders: Offender[] = [];
  for (const [name, range] of Object.entries({
    ...parsed.dependencies,
    ...parsed.peerDependencies,
  })) {
    if (name.startsWith('@openpanel/')) {
      offenders.push({
        file: `${SHARED_PACKAGE_ROOT}/package.json`,
        line: 1,
        detail: `${name}@${range} — R21: the shared package imports no workspace package`,
      });
    }
  }

  return {
    label: `workspace dependencies declared by ${SHARED_PACKAGE_NAME}`,
    count: offenders.length,
    target: 0,
    offenders: sorted(offenders),
  };
}

// --- reported-only hints ------------------------------------------------------

/** R1 — a module's root files carry the `<name>.` prefix and stop at `src/`. */
export function checkModuleLayout(
  modulePaths: string[],
  moduleRootFiles: Map<string, string[]>
): Metric {
  const offenders: Offender[] = [];

  for (const moduleName of [...modulePaths].sort()) {
    for (const file of (moduleRootFiles.get(moduleName) ?? []).sort()) {
      const match = MODULE_ROOT_FILE.exec(basename(file));
      if (!match) {
        offenders.push({
          file,
          line: 1,
          detail: `root file is not <name>.{rpc,service,routes,jobs,constants}.ts`,
        });
        continue;
      }
      if (match[1] !== moduleName) {
        offenders.push({
          file,
          line: 1,
          detail: `root file is prefixed "${match[1]}." but the module is "${moduleName}"`,
        });
      }
    }
  }

  return {
    label: `module root files not named <name>.<transport>.ts — ${modulePaths.length} modules`,
    count: offenders.length,
    target: null,
    offenders: sorted(offenders),
  };
}

/** R4 — declare functions first, then `return { one, two, three }`. */
export function checkFactoryReturnShape(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];

  for (const { source, fn } of serviceFactories(sources)) {
    const body = fn.declaration.body;
    if (!(body && ts.isBlock(body))) {
      continue;
    }
    const last = body.statements.at(-1);
    const returnsObjectLiteral =
      last &&
      ts.isReturnStatement(last) &&
      last.expression &&
      ts.isObjectLiteralExpression(last.expression);
    if (returnsObjectLiteral) {
      continue;
    }
    offenders.push({
      file: source.path,
      line: lineOf(source, fn.anchor.getStart(source.sourceFile)),
      detail: `${fn.name} does not end in \`return { ... }\` — R4 makes that line the module's index`,
    });
  }

  return {
    label: 'service factories not ending in a `return { ... }` index line',
    count: offenders.length,
    target: null,
    offenders: sorted(offenders),
  };
}

/** R18 — a job payload must survive a JSON round-trip, so no `z.date()`. */
export function checkJobPayloadDates(sources: ParsedSource[]): Metric {
  const offenders: Offender[] = [];

  for (const source of sources) {
    if (!source.path.endsWith('.jobs.ts')) {
      continue;
    }
    visit(source.sourceFile, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'date' &&
        node.expression.expression.getText() === 'z'
      ) {
        offenders.push({
          file: source.path,
          line: lineOf(source, node.getStart(source.sourceFile)),
          detail: 'z.date() in a job file — a payload must survive a JSON round-trip',
        });
      }
    });
  }

  return {
    label: 'z.date() in a *.jobs.ts payload',
    count: offenders.length,
    target: null,
    offenders: sorted(offenders),
  };
}

/**
 * R2 — nothing has an rpc procedure with no frontend caller.
 *
 * A textual `<router>.<procedure>` search of the dashboard. It is a hint, not a
 * verdict: a procedure reached through a computed key would read as uncalled,
 * which is exactly why R2 is reported and not asserted.
 */
export function checkRpcProceduresWithoutCallers(
  routers: { routerKey: string; source: ParsedSource; procedures: { name: string; line: number }[] }[],
  frontendText: string
): Metric {
  const offenders: Offender[] = [];

  for (const router of routers) {
    for (const procedure of router.procedures) {
      if (frontendText.includes(`${router.routerKey}.${procedure.name}`)) {
        continue;
      }
      offenders.push({
        file: router.source.path,
        line: procedure.line,
        detail: `${router.routerKey}.${procedure.name} — no textual call site in apps/start`,
      });
    }
  }

  return {
    label: 'rpc procedures with no apps/start call site',
    count: offenders.length,
    target: null,
    offenders: sorted(offenders),
  };
}

/** R17 — refines precede the transform, and loadConfig takes env as a parameter. */
export function checkConfigLoaderShape(source: ParsedSource | undefined): Metric {
  if (!source) {
    return {
      label: 'config loader shape (apps/api/src/config/env.ts)',
      count: 0,
      target: null,
      offenders: [],
      note: 'apps/api/src/config/env.ts not found.',
    };
  }

  const offenders: Offender[] = [];
  let transformLine: number | undefined;
  const refineLines: number[] = [];

  visit(source.sourceFile, (node) => {
    if (
      !(
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      )
    ) {
      return;
    }
    const line = lineOf(source, node.getStart(source.sourceFile));
    const method = node.expression.name.text;
    if (method === 'transform' && transformLine === undefined) {
      transformLine = line;
    }
    if (method === 'refine' || method === 'superRefine') {
      refineLines.push(line);
    }
  });

  for (const line of refineLines) {
    if (transformLine !== undefined && line > transformLine) {
      offenders.push({
        file: source.path,
        line,
        detail: `.refine at line ${line} comes after the .transform at line ${transformLine} — R17 puts cross-field invariants first`,
      });
    }
  }

  const loadConfig = namedFunctions(source).find(
    (fn) => fn.name === 'loadConfig'
  );
  if (!loadConfig) {
    offenders.push({
      file: source.path,
      line: 1,
      detail: 'no loadConfig function found',
    });
  } else if (!loadConfig.declaration.parameters[0]?.initializer) {
    offenders.push({
      file: source.path,
      line: lineOf(source, loadConfig.anchor.getStart(source.sourceFile)),
      detail:
        'loadConfig has no defaulted `source` parameter — R17 wants loadConfig(source = process.env) so a test can pass a minimal object',
    });
  }

  return {
    label: 'config loader shape (apps/api/src/config/env.ts)',
    count: offenders.length,
    target: null,
    offenders: sorted(offenders),
    note: `${refineLines.length} refine(s), transform at line ${transformLine ?? 'none'}`,
  };
}
