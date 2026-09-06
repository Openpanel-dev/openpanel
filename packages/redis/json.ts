// Local copy of @openpanel/core's shared/json.ts (deleted with @openpanel/json
// in M11-009). packages/redis cannot import @openpanel/core at runtime —
// @openpanel/core depends on @openpanel/redis, so a runtime import here would
// invert that edge. Keep in sync with packages/core/src/shared/json.ts if the
// semantics ever change.
import superjson from 'superjson';

export function getSafeJson<T>(str: string): T | null {
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

export function setSuperJson(value: unknown): string {
  return superjson.stringify(value);
}
