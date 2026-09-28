#!/usr/bin/env bun
/**
 * TRPC routing golden — proves every procedure the mounted router declares is
 * reachable through the real HTTP lifecycle, and that the auth layer answers
 * identically before and after the M11-001 mount swap.
 *
 * Only 11 of 217 procedures have any end-to-end coverage and 22 of the 29
 * routers have none, so swapping `apps/api/src/main.ts`'s `appRouter` import
 * needs a proof of its own. This is it: with the harness up, run it against the
 * OLD mount, swap, run it against the NEW mount, and diff the two maps.
 *
 * It asserts REACHABILITY, not behaviour. Every request is unauthenticated with
 * an empty input, so 401/403/400 are the expected answers — they prove the
 * procedure was resolved and its auth/validation middleware ran. Only a 404 or
 * a tRPC `NOT_FOUND` means the router did not resolve the path, and that is the
 * single failure this script exists to catch.
 *
 * Usage (needs `verification/harness start`): cd apps/api && bun run
 * e2e/trpc-routing-golden.ts /tmp/trpc-routing-after.json
 *
 * The router is imported from whatever specifier `main.ts` mounts, read out of
 * main.ts itself, so the same committed script measures both sides of the swap
 * with no flag to forget. `@openpanel/trpc` opens Redis connections at import
 * time and never releases the event loop, hence the explicit process.exit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `import.meta.dir` is the Bun idiom (ADR-019 row 6), but apps/api's tsconfig
// carries no bun type declarations, so this file uses the portable form.
const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const MAIN_TS = join(REPO_ROOT, 'apps', 'api', 'src', 'main.ts');
const DEFAULT_API_PORT = '3333';
const TRPC_ENDPOINT = '/trpc';
const REQUEST_TIMEOUT_MS = 30_000;
const CONCURRENCY = 8;

/**
 * Every `import { … } from '…'` in main.ts. The mounted router is the one
 * whose specifier list contains `appRouter` — matched as a whole binding
 * rather than as a line, because biome's organizeImports merges it into the
 * package's existing import block.
 */
const IMPORT_STATEMENT = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g;

function readEnvVar(key: string): string | undefined {
  const line = readFileSync(join(REPO_ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.startsWith(`${key}=`))
    .pop();
  return (
    line
      ?.slice(key.length + 1)
      .replaceAll('"', '')
      .trim() || undefined
  );
}

const API_BASE_URL =
  process.env.E2E_API_URL ??
  `http://127.0.0.1:${readEnvVar('API_PORT') ?? DEFAULT_API_PORT}`;

function mountedRouterSpecifier(): string {
  const source = readFileSync(MAIN_TS, 'utf8');
  for (const [, bindings, specifier] of source.matchAll(IMPORT_STATEMENT)) {
    const names = (bindings as string).split(',').map(
      (binding) =>
        binding
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
    );
    if (names.includes('appRouter')) {
      return specifier as string;
    }
  }
  throw new Error(`no import of \`appRouter\` in ${MAIN_TS}`);
}

interface ProcedureProbe {
  type: string;
  status: number;
  code: string | null;
}

/**
 * tRPC 11.17 keys `_def.procedures` by dotted path, so the keys are the flat
 * procedure set and each value carries its own `_def.type`.
 */
async function enumerateProcedures(): Promise<Map<string, string>> {
  const specifier = mountedRouterSpecifier();
  const module = (await import(specifier)) as {
    appRouter: {
      _def: { procedures: Record<string, { _def: { type: string } }> };
    };
  };
  const entries = Object.entries(module.appRouter._def.procedures)
    .map(([path, procedure]) => [path, procedure._def.type] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  console.log(`mounted router: ${specifier}`);
  return new Map(entries);
}

/** One unauthenticated request, shaped exactly as a superjson tRPC client sends it. */
async function probe(path: string, type: string): Promise<ProcedureProbe> {
  const body = JSON.stringify({ json: {} });
  const isMutation = type === 'mutation';
  const url = isMutation
    ? `${API_BASE_URL}${TRPC_ENDPOINT}/${path}`
    : `${API_BASE_URL}${TRPC_ENDPOINT}/${path}?input=${encodeURIComponent(body)}`;

  try {
    const response = await fetch(url, {
      method: isMutation ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      body: isMutation ? body : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const raw = (await response.json().catch(() => null)) as {
      error?: { json?: { data?: { code?: string } } };
    } | null;
    return {
      type,
      status: response.status,
      code: raw?.error?.json?.data?.code ?? null,
    };
  } catch (error) {
    return {
      type,
      status: -1,
      code: `TRANSPORT_ERROR: ${(error as Error).message}`,
    };
  }
}

/** A path the router did not resolve — the only outcome this golden fails on. */
function isRoutingFailure(result: ProcedureProbe): boolean {
  return result.status === 404 || result.code === 'NOT_FOUND';
}

async function main(): Promise<number> {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error('usage: bun run e2e/trpc-routing-golden.ts <output.json>');
    return 2;
  }

  const procedures = await enumerateProcedures();
  const paths = [...procedures.keys()];
  console.log(
    `probing ${paths.length} procedures across ` +
      `${new Set(paths.map((p) => p.split('.')[0])).size} routers at ${API_BASE_URL}`
  );

  const results: Record<string, ProcedureProbe> = {};
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++] as string;
        results[path] = await probe(path, procedures.get(path) as string);
      }
    })
  );

  const sorted: Record<string, ProcedureProbe> = {};
  for (const path of paths) {
    sorted[path] = results[path] as ProcedureProbe;
  }
  writeFileSync(outputPath, `${JSON.stringify(sorted, null, 2)}\n`);

  const tally = new Map<string, number>();
  for (const result of Object.values(sorted)) {
    const key = `${result.status} ${result.code ?? 'ok'}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  console.log(`\nwrote ${outputPath}`);
  for (const [key, count] of [...tally].sort()) {
    console.log(`  ${String(count).padStart(4)}  ${key}`);
  }

  const failures = Object.entries(sorted).filter(([, r]) =>
    isRoutingFailure(r)
  );
  console.log(
    `\ntrpc-routing-golden: ${paths.length - failures.length}/${paths.length} reachable, ` +
      `${failures.length} routing failure(s)`
  );
  for (const [path, result] of failures) {
    console.log(
      `  UNREACHABLE  ${path} -> ${result.status} ${result.code ?? ''}`
    );
  }
  return failures.length === 0 ? 0 : 1;
}

process.exit(await main());
