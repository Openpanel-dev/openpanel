export function toDots(
  obj: Record<string, unknown>,
  path = "",
): Record<string, number | string | boolean> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (typeof value === "object" && value !== null) {
      return {
        ...acc,
        ...toDots(value as Record<string, unknown>, `${path}${key}.`),
      };
    }

    return {
      ...acc,
      [`${path}${key}`]: value,
    };
  }, {});
}

export function entries<K extends string | number | symbol, V>(
  obj: Record<K, V>,
): [K, V][] {
  return Object.entries(obj) as [K, V][];
}
