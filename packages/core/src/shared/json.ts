// Ported from @openpanel/json, same semantics: getSafeJson never throws, and
// getSuperJson only hands off to superjson's parser when the payload looks
// like superjson's own `{ json, meta }` envelope — a plain JSON payload
// round-trips through JSON.parse instead.
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
