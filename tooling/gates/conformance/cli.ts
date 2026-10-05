/**
 * Assembles every conformance check into one report and decides --assert.
 *
 * Output contract: one block per rule, offenders as `file:line`, a TOTAL
 * line per rule and one overall, stable ordering and no timestamps in the
 * body — so a change can be verified by diffing two reports.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  API_SOURCE_ROOT,
  CORE_SOURCE_ROOT,
  CORE_V1_COMPAT_FILE,
  CRUISER_FRONTEND_RULE_NAME,
  CRUISER_LAYER_RULE_NAMES,
  MAX_OFFENDERS_PRINTED,
  R22_SHARED_UPWARD_RULE,
  R22_TRANSPORT_UPWARD_FROM,
  R22_TRANSPORT_UPWARD_RULE,
  R22_TRANSPORT_UPWARD_TO,
} from './conformance.constants';
import { resolveImportLine, runCruiser, violationsOf } from './cruiser';
import {
  checkAccessChecks,
  checkConfigLoaderShape,
  checkCreateServicesCallSites,
  checkDependencyLoaders,
  checkDuplicateUtilities,
  checkEnvReads,
  checkFactoryReturnShape,
  checkFactorySignatures,
  checkJobPayloadDates,
  checkModuleLayout,
  checkModuleScopeConstruction,
  checkResidue,
  checkRpcProceduresWithoutCallers,
  checkServiceInterfaces,
  checkServicesMembers,
  checkSharedPackageIsolation,
  type Metric,
} from './rules';
import {
  lineOf,
  listSourceFiles,
  type Offender,
  type ParsedSource,
  readSources,
  ts,
  visit,
} from './sources';

interface RuleBlock {
  id: string;
  title: string;
  asserted: boolean;
  metrics: Metric[];
  note?: string;
}

const START_SOURCE_ROOT = 'apps/start/src';
const MODULES_ROOT = `${CORE_SOURCE_ROOT}/modules`;
const CONFIG_ENV_FILE = `${API_SOURCE_ROOT}/config/env.ts`;
// Static `from '../v1-compat'` and dynamic `await import('../v1-compat')` alike:
// a lazy import is still an R6 defect and would be missed by a `from`-only
// pattern.
const V1_COMPAT_IMPORT = /['"][^'"]*\/v1-compat['"]/;
const RULE_ID_WIDTH = 4;
const SEPARATOR_WIDTH = 80;

const heavy = '='.repeat(SEPARATOR_WIDTH);
const light = '-'.repeat(SEPARATOR_WIDTH);

interface Tree {
  repoRoot: string;
  core: ParsedSource[];
  api: ParsedSource[];
  moduleNames: string[];
  moduleRootFiles: Map<string, string[]>;
  utilityPaths: string[];
  residueFiles: { path: string; text: string }[];
  startText: string;
  configEnv: ParsedSource | undefined;
  /** Core INCLUDING tests — the v1-compat importer count needs them. */
  allCoreText: { path: string; text: string }[];
}

function collect(repoRoot: string): Tree {
  const corePaths = listSourceFiles(repoRoot, CORE_SOURCE_ROOT);
  const apiPaths = listSourceFiles(repoRoot, API_SOURCE_ROOT);
  const startPaths = listSourceFiles(repoRoot, START_SOURCE_ROOT);
  const core = readSources(repoRoot, corePaths);
  const api = readSources(repoRoot, apiPaths);

  const moduleNames = [
    ...new Set(
      corePaths
        .filter((path) => path.startsWith(`${MODULES_ROOT}/`))
        .map((path) => path.slice(MODULES_ROOT.length + 1).split('/')[0])
    ),
  ].sort();

  const moduleRootFiles = new Map<string, string[]>();
  for (const moduleName of moduleNames) {
    const root = `${MODULES_ROOT}/${moduleName}`;
    moduleRootFiles.set(
      moduleName,
      corePaths.filter((path) => dirname(path) === root)
    );
  }

  // R21 looks across every app and package, not just core.
  const utilityPaths = [
    ...startPaths,
    ...corePaths,
    ...listSourceFiles(repoRoot, 'packages'),
    ...listSourceFiles(repoRoot, 'apps'),
  ];

  const residueFiles = [...corePaths, ...apiPaths, ...startPaths].map(
    (path) => ({ path, text: readFileSync(join(repoRoot, path), 'utf8') })
  );

  const startText = startPaths
    .map((path) => readFileSync(join(repoRoot, path), 'utf8'))
    .join('\n');

  return {
    repoRoot,
    core,
    api,
    moduleNames,
    moduleRootFiles,
    utilityPaths: [...new Set(utilityPaths)].sort(),
    residueFiles,
    startText,
    configEnv: api.find((source) => source.path === CONFIG_ENV_FILE),
    allCoreText: listSourceFiles(repoRoot, CORE_SOURCE_ROOT, {
      includeTests: true,
    }).map((path) => ({
      path,
      text: readFileSync(join(repoRoot, path), 'utf8'),
    })),
  };
}

const objectLiteralOf = (
  node: ts.Expression
): ts.ObjectLiteralExpression | undefined => {
  if (ts.isObjectLiteralExpression(node)) {
    return node;
  }
  // `createTRPCRouter({ ... })`.
  if (ts.isCallExpression(node)) {
    const first = node.arguments[0];
    if (first && ts.isObjectLiteralExpression(first)) {
      return first;
    }
  }
  return undefined;
};

/**
 * R2 — the router key each module is mounted under in `rpc.router.ts`, and the
 * procedure names it declares.
 *
 * The key matters: `apps/start` calls `trpc.<key>.<procedure>`, and the key is
 * the registry's, not the file's. `misc.rpc.ts` does not exist; `miscRouter`
 * does, mounted under whatever `rpc.router.ts` says.
 */
function collectRouters(tree: Tree) {
  const registry = tree.core.find(
    (source) => source.path === `${CORE_SOURCE_ROOT}/rpc.router.ts`
  );
  if (!registry) {
    return [];
  }

  // identifier -> the module rpc file it is imported from.
  const importedFrom = new Map<string, string>();
  for (const statement of registry.sourceFile.statements) {
    if (
      !(
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      )
    ) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.endsWith('.rpc')) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        importedFrom.set(
          element.name.text,
          `${CORE_SOURCE_ROOT}/${specifier.replace(/^\.\//, '')}.ts`
        );
      }
    }
  }

  // routerKey -> identifier, from `createTRPCRouter({ key: xRouter, ... })`.
  const mounted = new Map<string, string>();
  visit(registry.sourceFile, (node) => {
    if (
      !(
        ts.isCallExpression(node) &&
        node.expression.getText().endsWith('Router')
      )
    ) {
      return;
    }
    const literal = objectLiteralOf(node);
    for (const property of literal?.properties ?? []) {
      if (
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        ts.isIdentifier(property.initializer)
      ) {
        mounted.set(property.name.text, property.initializer.text);
      }
    }
  });

  const routers: {
    routerKey: string;
    source: ParsedSource;
    procedures: { name: string; line: number }[];
  }[] = [];

  for (const [routerKey, identifier] of mounted) {
    const path = importedFrom.get(identifier);
    const source = tree.core.find((candidate) => candidate.path === path);
    if (!source) {
      continue;
    }

    const procedures: { name: string; line: number }[] = [];
    visit(source.sourceFile, (node) => {
      if (
        !(
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === identifier &&
          node.initializer
        )
      ) {
        return;
      }
      for (const property of objectLiteralOf(node.initializer)?.properties ??
        []) {
        if (property.name && ts.isIdentifier(property.name)) {
          procedures.push({
            name: property.name.text,
            line: lineOf(source, property.getStart(source.sourceFile)),
          });
        }
      }
    });

    if (procedures.length > 0) {
      routers.push({ routerKey, source, procedures });
    }
  }

  return routers.sort((a, b) => a.routerKey.localeCompare(b.routerKey));
}

const reviewOnly = (label: string, hint: string): Metric => ({
  label,
  count: 0,
  target: null,
  offenders: [],
  note: hint,
});

function cruiserMetric(
  label: string,
  ruleName: string,
  cruiser: ReturnType<typeof runCruiser>,
  tree: Tree,
  filter?: (violation: { from: string; to: string }) => boolean
): Metric {
  if (!cruiser.available) {
    return {
      label,
      count: -1,
      target: 0,
      offenders: [],
      note: `UNAVAILABLE: ${cruiser.error}`,
    };
  }
  const violations = violationsOf(cruiser, ruleName).filter(
    (violation) => !filter || filter(violation)
  );
  return {
    label,
    count: violations.length,
    target: 0,
    offenders: violations.map((violation) => {
      // dependency-cruiser reports an edge, not a position; resolve it back to
      // the import that made it so the offender is a real file:line.
      const source = tree.core.find(
        (candidate) => candidate.path === violation.from
      );
      return {
        file: violation.from,
        line: source ? resolveImportLine(source, violation.to) : 0,
        detail: `-> ${violation.to} (${violation.rule})`,
      };
    }),
  };
}

/** A metric that restates edges another metric already asserted on. */
const asView = (metric: Metric): Metric => ({
  ...metric,
  target: null,
  note: [metric.note, 'A view of the rules above — already asserted there.']
    .filter(Boolean)
    .join('\n'),
});

function buildRules(tree: Tree): RuleBlock[] {
  const cruiser = runCruiser(tree.repoRoot);
  const routers = collectRouters(tree);
  const v1Compat = tree.core.find(
    (source) => source.path === CORE_V1_COMPAT_FILE
  );
  // Tests count too: a test importing v1-compat is as much a caller as a
  // service is.
  const v1CompatImporters = tree.allCoreText.filter(
    ({ path, text }) =>
      path !== CORE_V1_COMPAT_FILE && V1_COMPAT_IMPORT.test(text)
  ).length;

  return [
    {
      id: 'R1',
      title:
        'A module is a directory under src/modules/ holding only what it needs',
      asserted: false,
      metrics: [checkModuleLayout(tree.moduleNames, tree.moduleRootFiles)],
    },
    {
      id: 'R2',
      title: 'Take only the transports that have callers',
      asserted: false,
      metrics: [checkRpcProceduresWithoutCallers(routers, tree.startText)],
    },
    {
      id: 'R3',
      title:
        'services.ts is the composition root: (deps: ServiceDeps, services: () => Services)',
      asserted: true,
      metrics: [checkFactorySignatures(tree.core)],
    },
    {
      id: 'R4',
      title: 'Declare functions first, then `return { one, two, three }`',
      asserted: false,
      metrics: [checkFactoryReturnShape(tree.core)],
    },
    {
      id: 'R5',
      title:
        'Services members are ReturnType<typeof createXService>; no hand-written XService interface',
      asserted: true,
      metrics: [
        checkServiceInterfaces(tree.core),
        checkServicesMembers(tree.core),
      ],
    },
    {
      id: 'R6',
      title:
        'The graph is rebuilt per unit of work; there is no "no context" path',
      asserted: true,
      metrics: [
        checkCreateServicesCallSites([...tree.core, ...tree.api]),
        checkDependencyLoaders(tree.core),
      ],
      note: v1Compat
        ? `v1-compat.ts: ${v1Compat.text.replace(/\n$/, '').split('\n').length} lines, ${v1CompatImporters} importers (tests included) — the headline numbers for fix-wave step 2. ADR-022 measured 2,104 lines / 69 importers at 6694c5b7 on 2026-09-07.`
        : undefined,
    },
    {
      id: 'R7',
      title: 'Nothing but the config loader reads process.env',
      asserted: true,
      metrics: checkEnvReads(tree.core),
    },
    {
      id: 'R9',
      title:
        'Clients are transports: config in, typed result or ProviderError out, no logger',
      asserted: false,
      metrics: [
        reviewOnly(
          'client shape',
          'Review rule (ADR-022 check line: "review"). Read packages/core/src/clients/*: no logger, built once at boot, a missing thing is null.'
        ),
      ],
    },
    {
      id: 'R10',
      title: 'Access checks live in the auth service and the builders',
      asserted: true,
      metrics: [checkAccessChecks(tree.core)],
    },
    {
      id: 'R11',
      title: 'A .jobs.ts declares and constructs nothing',
      asserted: false,
      metrics: [
        reviewOnly(
          'job file shape',
          'Review rule (ADR-022 check line: "review + ADR-021"). See R18 below for the one mechanical half.'
        ),
      ],
    },
    {
      id: 'R12',
      title: 'Frontends import one thing, as a type: AppRouter',
      asserted: true,
      metrics: [
        cruiserMetric(
          `${CRUISER_FRONTEND_RULE_NAME} violations (delegated to dependency-cruiser)`,
          CRUISER_FRONTEND_RULE_NAME,
          cruiser,
          tree
        ),
      ],
    },
    {
      id: 'R13',
      title: 'index.ts exports what the app shell needs and nothing else',
      asserted: false,
      metrics: [
        reviewOnly(
          'index.ts and main.ts shape',
          'Review rule (ADR-022 check line: "review of index.ts and main.ts").'
        ),
      ],
    },
    {
      id: 'R14',
      title: 'Dead prefixes and dead names go',
      asserted: true,
      metrics: checkResidue(tree.residueFiles),
    },
    {
      id: 'R15',
      title: 'Core declares, the app constructs',
      asserted: true,
      metrics: [checkModuleScopeConstruction(tree.core)],
    },
    {
      id: 'R16',
      title: 'Whoever opens a connection closes it, and shutdown reverses open',
      asserted: false,
      metrics: [
        reviewOnly(
          'lifecycle',
          'Review rule (ADR-022 check line: "main.ts shutdown order vs open order; core does not close handed-in connections").'
        ),
      ],
    },
    {
      id: 'R17',
      title: 'The config loader has a shape',
      asserted: false,
      metrics: [checkConfigLoaderShape(tree.configEnv)],
    },
    {
      id: 'R18',
      title: 'Job payload discipline',
      asserted: false,
      metrics: [checkJobPayloadDates(tree.core)],
    },
    {
      id: 'R19',
      title: 'ProviderError.retryable is load-bearing',
      asserted: false,
      metrics: [
        reviewOnly(
          'provider error handling',
          'Review rule (ADR-022 check line: "review of every job-handler catch around a client call").'
        ),
      ],
    },
    {
      id: 'R21',
      title: 'Dumb utilities live below every package',
      asserted: true,
      metrics: [
        checkSharedPackageIsolation(tree.repoRoot),
        checkDuplicateUtilities(tree.utilityPaths),
      ],
    },
    {
      id: 'R22',
      title: 'Layers only import downward — by layer, not by path depth',
      asserted: true,
      metrics: [
        ...CRUISER_LAYER_RULE_NAMES.map((ruleName) =>
          cruiserMetric(
            `${ruleName} violations (delegated to dependency-cruiser)`,
            ruleName,
            cruiser,
            tree
          )
        ),
        // These two slices are VIEWS of the rules above, not extra
        // violations, so they carry no target: asserting on them would count
        // the same edges twice.
        asView(
          cruiserMetric(
            'ADR-022 baseline slice: shared/ -> above it',
            R22_SHARED_UPWARD_RULE,
            cruiser,
            tree
          )
        ),
        asView(
          cruiserMetric(
            'ADR-022 baseline slice: http/*, rpc/base.ts -> modules/*/src/*',
            R22_TRANSPORT_UPWARD_RULE,
            cruiser,
            tree,
            (violation) =>
              R22_TRANSPORT_UPWARD_FROM.test(violation.from) &&
              R22_TRANSPORT_UPWARD_TO.test(violation.to)
          )
        ),
      ],
      note: cruiser.available
        ? "M14-002 landed these rules and verified cruiser resolves its typescript peer, so R22 is the cruiser rule, not ADR-022's grep fallback. A bare ../ depth grep is forbidden: a module importing defineJob at ../../jobs/define is importing DOWNWARD."
        : undefined,
    },
    // R20 (test shapes) is deliberately absent from this gate.
  ];
}

const offenderLine = (offender: Offender): string =>
  offender.line > 0
    ? `    ${offender.file}:${offender.line}  ${offender.detail}`
    : `    ${offender.file}  ${offender.detail}`;

function renderMetric(metric: Metric, lines: string[]): void {
  const target =
    metric.target === null ? 'reported only' : `target ${metric.target}`;
  const count = metric.count < 0 ? 'UNAVAILABLE' : String(metric.count);
  lines.push(`  ${metric.label}`);
  lines.push(`    count ${count}, ${target}`);

  if (metric.note) {
    for (const noteLine of metric.note.split('\n')) {
      lines.push(`    # ${noteLine}`);
    }
  }

  const shown = metric.offenders.slice(0, MAX_OFFENDERS_PRINTED);
  for (const offender of shown) {
    lines.push(offenderLine(offender));
  }
  if (metric.offenders.length > shown.length) {
    lines.push(
      `    ... and ${metric.offenders.length - shown.length} more offender(s)`
    );
  }
  lines.push('');
}

/**
 * An ASSERTED rule totals its asserted metrics; a REPORT rule totals its hints.
 * Printing `TOTAL R1: 0` beside five listed offenders would read as a pass.
 */
function ruleTotal(rule: RuleBlock): number {
  return rule.metrics
    .filter((metric) => rule.asserted === (metric.target !== null))
    .reduce((sum, metric) => sum + Math.max(metric.count, 0), 0);
}

function metricIsAboveTarget(metric: Metric): boolean {
  if (metric.target === null) {
    return false;
  }
  // A delegated check that could not run counts as a failure, not as zero.
  return metric.count < 0 || metric.count > metric.target;
}

/**
 * The headline numbers, up top, so results can be checked at a glance without
 * scrolling 700 lines. Each entry names the rule and the metric it comes
 * from; the numbers themselves come from the same Metric objects the blocks
 * below print, never from a second measurement.
 */
const BASELINE_METRICS: readonly {
  rule: string;
  metric: number;
  label: string;
}[] = [
  { rule: 'R3', metric: 0, label: 'factories not on (deps, services)' },
  { rule: 'R5', metric: 0, label: 'hand-written XService interfaces' },
  {
    rule: 'R5',
    metric: 1,
    label:
      'Services members NOT typed by ReturnType (see the block for how many DO)',
  },
  { rule: 'R6', metric: 0, label: 'unsanctioned createServices( call sites' },
  { rule: 'R6', metric: 1, label: 'load* dependency loaders' },
  { rule: 'R7', metric: 0, label: 'process.env.<name> reads in core' },
  { rule: 'R10', metric: 0, label: 'require* defs outside the auth stack' },
  { rule: 'R14', metric: 0, label: 'NEXT_PUBLIC_ in core' },
  { rule: 'R15', metric: 0, label: 'module-scope construction in core' },
  { rule: 'R21', metric: 1, label: 'duplicate util copies' },
  { rule: 'R22', metric: 6, label: 'upward imports: shared/ -> above' },
  { rule: 'R22', metric: 7, label: 'upward imports: transport -> module src' },
];

function renderBaseline(rules: RuleBlock[], lines: string[]): void {
  lines.push('BASELINE REPRODUCTION (ADR-022 / CONFORMANCE_GATE_SPEC.md)');
  lines.push('');
  for (const entry of BASELINE_METRICS) {
    const metric = rules.find((rule) => rule.id === entry.rule)?.metrics[
      entry.metric
    ];
    if (!metric) {
      continue;
    }
    const count = metric.count < 0 ? 'UNAVAILABLE' : String(metric.count);
    lines.push(
      `  ${entry.rule.padEnd(RULE_ID_WIDTH)} ${count.padStart(4)}  ${entry.label}`
    );
  }
  lines.push('');
}

export function renderReport(rules: RuleBlock[]): string {
  const lines: string[] = [
    heavy,
    'OpenPanel conformance gate (ADR-022) — report',
    heavy,
    '',
    'Rules R1..R22 in order. ASSERT rules fail `--assert` above their target;',
    'REPORT rules are review rules and are printed as hints only. R20 is',
    'deferred by Carl (2026-09-08) and is absent by design.',
    '',
  ];

  renderBaseline(rules, lines);

  let assertedTotal = 0;
  for (const rule of rules) {
    const mode = rule.asserted ? 'ASSERT' : 'REPORT';
    lines.push(light);
    lines.push(`${rule.id.padEnd(RULE_ID_WIDTH)} ${mode}  ${rule.title}`);
    lines.push(light);
    if (rule.note) {
      for (const noteLine of rule.note.split('\n')) {
        lines.push(`  # ${noteLine}`);
      }
      lines.push('');
    }
    for (const metric of rule.metrics) {
      renderMetric(metric, lines);
    }
    const total = ruleTotal(rule);
    lines.push(
      `  TOTAL ${rule.id}: ${total}${rule.asserted ? '' : ' (reported, not asserted)'}`
    );
    lines.push('');
    if (rule.asserted) {
      assertedTotal += total;
    }
  }

  lines.push(heavy);
  lines.push(`TOTAL asserted violations: ${assertedTotal}`);
  lines.push(heavy);
  return lines.join('\n');
}

export function renderAssert(rules: RuleBlock[]): {
  output: string;
  failed: boolean;
} {
  const lines: string[] = [];
  let failures = 0;

  for (const rule of rules) {
    if (!rule.asserted) {
      continue;
    }
    const above = rule.metrics.filter(metricIsAboveTarget);
    if (above.length === 0) {
      continue;
    }
    lines.push(light);
    lines.push(`${rule.id.padEnd(RULE_ID_WIDTH)} FAIL  ${rule.title}`);
    lines.push(light);
    for (const metric of above) {
      renderMetric(metric, lines);
      failures += Math.max(metric.count, 1);
    }
    lines.push(`  TOTAL ${rule.id}: ${ruleTotal(rule)}`);
    lines.push('');
  }

  if (failures === 0) {
    return {
      output: 'OK: every asserted ADR-022 rule is at its target.',
      failed: false,
    };
  }

  lines.unshift(
    heavy,
    'OpenPanel conformance gate (ADR-022) — assert FAILED',
    heavy,
    ''
  );
  lines.push(heavy);
  lines.push(`FAIL: ${failures} asserted ADR-022 violation(s).`);
  lines.push(heavy);
  return { output: lines.join('\n'), failed: true };
}

/**
 * `conformance.sh --report | grep -q 36` closes the pipe on the first match and
 * the remaining ~700 lines land on a dead fd. Without this the gate prints an
 * EPIPE stack over an otherwise successful run.
 */
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') {
    throw error;
  }
});

const [, , mode, repoRootArgument] = process.argv;
const repoRoot = repoRootArgument ?? process.cwd();
const rules = buildRules(collect(repoRoot));

if (mode === '--assert') {
  const { output, failed } = renderAssert(rules);
  process.stdout.write(`${output}\n`);
  process.exit(failed ? 1 : 0);
}

process.stdout.write(`${renderReport(rules)}\n`);
