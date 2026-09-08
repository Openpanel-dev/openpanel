/**
 * The gate's own tests.
 *
 * Two of them are mandatory, and they are the reason this gate parses TypeScript
 * instead of grepping. Both traps were measured against `packages/core/src` on
 * 2026-09-08 and both make a naive gate report the wrong number:
 *
 *   trap 1  `rg 'export function create[A-Za-z]+Service\(deps'` finds 28 of the
 *           36 factories, because eight signatures span lines.
 *   trap 2  `rg -o 'ReturnType<typeof create' services.ts` matches once and the
 *           match is a COMMENT at services.ts:154; the pattern is applied in
 *           code zero times.
 *
 * The fixtures below contain exactly those shapes. A regression that reverts a
 * check to a line-oriented match fails here.
 */

import { describe, expect, test } from 'bun:test';

import { ASSET_LOADER_ALLOWLIST } from './conformance.constants';
import {
  checkCreateServicesCallSites,
  checkDependencyLoaders,
  checkFactorySignatures,
  checkServicesMembers,
  collectEnvReads,
} from './rules';
import { parseSource } from './sources';

const NAIVE_FACTORY_GREP = /export function create[A-Za-z]+Service\(deps/g;
const NAIVE_RETURN_TYPE_GREP = /ReturnType<typeof create/g;

const matchCount = (text: string, pattern: RegExp): number =>
  (text.match(pattern) ?? []).length;

describe('trap 1 — a factory signature that spans lines', () => {
  // Three factories: one on a single line, one whose argument list starts on the
  // next line, and one already conformant. A line-oriented grep sees one.
  const source = `
import type { ServiceDeps, Services } from '../../services';

export function createOneLineService(deps: ServiceDeps) {
  return { a: () => deps };
}

export function createWrappedService(
  deps: ServiceDeps
) {
  return { b: () => deps };
}

export function createConformantService(
  deps: ServiceDeps,
  services: () => Services
) {
  return { c: () => services() };
}
`;

  test('the naive grep undercounts, which is why it is not the check', () => {
    expect(matchCount(source, NAIVE_FACTORY_GREP)).toBe(1);
  });

  test('the AST check sees all three factories', () => {
    const metric = checkFactorySignatures([
      parseSource('packages/core/src/modules/x/x.service.ts', source),
    ]);
    expect(metric.label).toContain('of 3');
  });

  test('it flags both non-conformant signatures, including the wrapped one', () => {
    const metric = checkFactorySignatures([
      parseSource('packages/core/src/modules/x/x.service.ts', source),
    ]);
    expect(metric.count).toBe(2);
    expect(metric.offenders.map((offender) => offender.detail)).toEqual([
      expect.stringContaining('createOneLineService'),
      expect.stringContaining('createWrappedService'),
    ]);
  });

  test('an arrow-function factory is counted too', () => {
    const arrows = `
import type { ServiceDeps } from '../../services';
export const createArrowService = (deps: ServiceDeps) => ({ a: () => deps });
`;
    const metric = checkFactorySignatures([
      parseSource('packages/core/src/modules/y/y.service.ts', arrows),
    ]);
    expect(metric.count).toBe(1);
  });
});

describe('trap 2 — ReturnType<typeof create...> in a comment', () => {
  // The comment is the shape of the real one at services.ts:154. One member is
  // typed by hand, one is typed the way R5 wants.
  const source = `
// Two type rules the compiler enforces but cannot explain:
//
// 1. \`Services\` must stay an INTERFACE. A type alias over
//    \`ReturnType<typeof createServices>\` is circular — resolving it needs
//    every factory's signature and every factory's signature names
//    \`Services\`.
export interface Services {
  auth: AuthService;
  chart: ReturnType<typeof createChartService>;
}
`;

  test('the naive grep counts the comment as a compliant member', () => {
    // Two matches for one real member: the grep cannot tell them apart.
    expect(matchCount(source, NAIVE_RETURN_TYPE_GREP)).toBe(2);
  });

  test('the AST check ignores the comment and counts only the real member', () => {
    const metric = checkServicesMembers([
      parseSource('packages/core/src/services.ts', source),
    ]);
    expect(metric.label).toContain('1 of 2');
    expect(metric.count).toBe(1);
    expect(metric.offenders[0].detail).toContain('auth: AuthService');
  });

  test('a file whose only match is the comment scores zero compliant members', () => {
    const commentOnly = `
// \`ReturnType<typeof createServices>\` is circular.
export interface Services {
  auth: AuthService;
}
`;
    const metric = checkServicesMembers([
      parseSource('packages/core/src/services.ts', commentOnly),
    ]);
    expect(matchCount(commentOnly, NAIVE_RETURN_TYPE_GREP)).toBe(1);
    expect(metric.label).toContain('0 of 1');
  });
});

describe('R6 — the asset-loader carve-out is an allowlist, not a pattern', () => {
  const geo = parseSource(
    'packages/core/src/clients/geo.ts',
    'async function loadDatabase(filename: string) { return filename; }\n'
  );
  const flushExports = parseSource(
    'packages/core/src/modules/integration/src/flush-exports.ts',
    'async function loadCursor(id: string) { return id; }\n'
  );

  test('the two allowlisted asset loaders are not offenders', () => {
    const metric = checkDependencyLoaders([geo, flushExports]);
    expect(metric.count).toBe(0);
    expect(metric.label).toContain('0 of 2 load* functions');
  });

  test('the allowlist is exactly the two ADR-022 names, each with a reason', () => {
    expect(ASSET_LOADER_ALLOWLIST.map((entry) => entry.file)).toEqual([
      'packages/core/src/clients/geo.ts',
      'packages/core/src/modules/integration/src/flush-exports.ts',
    ]);
    for (const entry of ASSET_LOADER_ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  test('a NEW loader cannot join the allowlist by looking like one', () => {
    const impostor = parseSource(
      'packages/core/src/modules/other/src/thing.ts',
      'async function loadDatabase() { return null; }\n'
    );
    const metric = checkDependencyLoaders([impostor]);
    expect(metric.count).toBe(1);
  });

  test('the same name in the WRONG file is still an offender', () => {
    const wrongFile = parseSource(
      'packages/core/src/clients/geo-other.ts',
      'async function loadCursor() { return null; }\n'
    );
    expect(checkDependencyLoaders([wrongFile]).count).toBe(1);
  });
});

describe('R6 — createServices call sites', () => {
  test('a call in a comment or a string is not a call site', () => {
    const source = parseSource(
      'packages/core/src/modules/x/x.service.ts',
      `
// createServices( is built once per unit of work.
const documentation = 'call createServices( only at the sanctioned sites';
`
    );
    expect(checkCreateServicesCallSites([source]).count).toBe(0);
  });

  test('a real call outside the sanctioned sites is an offender', () => {
    const source = parseSource(
      'packages/core/src/v1-compat.ts',
      'const services = createServices(deps);\n'
    );
    expect(checkCreateServicesCallSites([source]).count).toBe(1);
  });

  test('the same call inside a sanctioned site is not', () => {
    const source = parseSource(
      'packages/core/src/context.ts',
      'const services = createServices(deps);\n'
    );
    expect(checkCreateServicesCallSites([source]).count).toBe(0);
  });
});

describe('R7 — process.env forms a `process.env.` grep gets wrong', () => {
  const source = parseSource(
    'packages/core/src/shared/get-client-ip.ts',
    `
// core reads no process.env.
const a = process.env.PLAIN;
const b = process.env?.OPTIONAL;
const c = process.env['BRACKETED'];
`
  );

  test('the comment is not a read and the optional-chained one is', () => {
    const { dotted, bracketed } = collectEnvReads([source]);
    expect(dotted.map((offender) => offender.detail)).toEqual([
      'process.env.PLAIN',
      'process.env.OPTIONAL',
    ]);
    expect(bracketed).toHaveLength(1);
  });

  test('the naive grep gets a different answer to the AST', () => {
    const grepped = matchCount(source.text, /process\.env\./g);
    // One comment counted, one `process.env?.` missed, one `process.env[` missed.
    expect(grepped).toBe(2);
  });
});
