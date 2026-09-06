// Copied from @openpanel/core/src/shared/json.ts (ADR-007/ADR-008:
// frontend-values-only-constants forbids apps/start value-importing core
// outside a *.constants.ts path). getSuperJson only hands off to superjson's
// parser when the payload looks like its own `{ json, meta }` envelope; a
// plain JSON payload round-trips through JSON.parse instead.
import superjson from 'superjson';

function getSafeJson<T>(str: string): T | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function getSuperJson<T>(str: string): T | null {
  const json = getSafeJson<T>(str);
  if (typeof json === 'object' && json !== null && 'json' in json) {
    return superjson.parse<T>(str);
  }
  return json;
}
