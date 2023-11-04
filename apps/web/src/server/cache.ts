const cache = new Map<
  string,
  {
    expires: number;
    data: any;
  }
>();

export function get(key: string) {
  const hit = cache.get(key);
  if (hit) {
    if (hit.expires > Date.now()) {
      return hit.data;
    }
    cache.delete(key);
  }
  return null;
}

export function set(key: string, expires: number, data: any) {
  cache.set(key, {
    expires: Date.now() + expires,
    data,
  });
}

export async function getOr<T>(
  key: string,
  expires: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = get(key);
  if (hit) {
    return hit;
  }
  const data = await fn();
  set(key, expires, data);
  return data;
}
