import superjson from 'superjson';

export function getSafeJson<T>(str: string): T | null {
  try {
    return JSON.parse(str);
  } catch (e) {
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

export function setSuperJson(str: any): string {
  return superjson.stringify(str);
}
