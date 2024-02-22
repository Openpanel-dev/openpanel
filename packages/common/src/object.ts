import { anyPass, assocPath, isEmpty, isNil, reject } from 'ramda';

export function toDots(
  obj: Record<string, unknown>,
  path = ''
): Record<string, number | string | boolean> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (typeof value === 'object' && value !== null) {
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

export function toObject(
  obj: Record<string, string | undefined>
): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  Object.entries(obj).forEach(([key, value]) => {
    result = assocPath(key.split('.'), value, result);
  });
  return result;
}

export const strip = reject(anyPass([isEmpty, isNil]));

export function getSafeJson<T>(str: string): T | null {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}
