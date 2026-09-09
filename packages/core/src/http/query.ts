// The querystring pre-pass, ported from
// apps/api/src/utils/parse-zod-query-string.ts (ADR-003, "behaviour that must
// be re-implemented deliberately": the `parseQueryString` pre-pass as an
// Elysia lifecycle hook running BEFORE schema validation on `/export` and
// `/insights`).
//
// It exists because ~31 query schemas on those two surfaces are written
// against already-coerced values — `z.number()`, `z.boolean()`,
// `z.array(...)` — while a querystring only ever carries strings. V1 coerced
// in a Fastify `preValidation` hook; rewriting those schemas with `z.coerce`
// instead would change the contract, which is why the ADR names the hook.
//
// `transform` is Elysia's pre-validation phase, and the hook MUTATES `query`
// in place: reassigning the destructured binding would not reach the object
// the validator then reads.

import { getSafeJson } from '@openpanel/shared';

const NUMERIC = /^-?[0-9]+(\.[0-9]+)?$/i;

function parseScalar(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(parseScalar);
  }
  if (typeof value === 'object' && value !== null) {
    return parseQueryString(value as Record<string, unknown>);
  }
  if (typeof value === 'string') {
    if (NUMERIC.test(value) && !Number.isNaN(Number.parseFloat(value))) {
      return Number.parseFloat(value);
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return getSafeJson(value) ?? value;
  }
  return null;
}

export function parseQueryString(
  source: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, parseScalar(value)])
  );
}

/** The `transform` hook itself. Registered LOCAL on the two route surfaces
 *  that had it in V1 — never globally, or `/track` and `/manage` would start
 *  coercing values their handlers read as strings. */
export function parseQueryStringTransform({
  query,
}: {
  query: Record<string, unknown>;
}): void {
  const parsed = parseQueryString(query);
  for (const [key, value] of Object.entries(parsed)) {
    query[key] = value;
  }
}
