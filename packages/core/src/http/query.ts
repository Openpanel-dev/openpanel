// A pre-validation hook that coerces `/export` and `/insights` querystrings: ~31
// query schemas there expect already-coerced values (`z.number`, `z.boolean`,
// `z.array`) while a querystring only carries strings, and `z.coerce` would
// change the contract. It MUTATES `query` in place: reassigning the destructured
// binding would not reach the object the validator reads.

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

/** Registered LOCAL on the two surfaces that need it, or `/track` and `/manage` would coerce values their handlers read as strings. */
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
