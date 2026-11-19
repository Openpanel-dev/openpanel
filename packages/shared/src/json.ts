// getSafeJson never throws; getSuperJson only uses superjson's parser when the payload looks like its `{ json, meta }`
// envelope, so a plain JSON payload goes through JSON.parse.
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
