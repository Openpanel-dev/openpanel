import { anyPass, assocPath, isEmpty, isNil, reject } from 'ramda';
import superjson from 'superjson';

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

    if (value === undefined || value === null) {
      return acc;
    }

    return {
      ...acc,
      [`${path}${key}`]:
        typeof value === 'string' ? value.trim() : String(value),
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

export function getSuperJson<T>(str: string): T | null {
  const json = getSafeJson<T>(str);
  if (
    typeof json === 'object' &&
    json !== null &&
    'json' in json &&
    'meta' in json
  ) {
    return superjson.parse<T>(str);
  }
  return json;
}

type AnyObject = Record<string, any>;

export function deepMergeObjects<T>(target: AnyObject, source: AnyObject): T {
  const merged: AnyObject = {};
  // Include all keys from both objects
  const allKeys = new Set([...Object.keys(target), ...Object.keys(source)]);

  allKeys.forEach((key) => {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (
      (isNil(sourceValue) && !isNil(targetValue)) ||
      (sourceValue === '' &&
        typeof targetValue === 'string' &&
        targetValue !== '')
    ) {
      // Keep target value if source value is null or undefined
      merged[key] = targetValue;
    } else if (
      sourceValue !== undefined &&
      isObject(targetValue) &&
      isObject(sourceValue)
    ) {
      // Recursively merge objects
      merged[key] = deepMergeObjects(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      // Directly assign any non-undefined source values
      merged[key] = sourceValue;
    } else if (sourceValue === undefined && target[key] !== undefined) {
      // Keep target value if source value is undefined
      merged[key] = targetValue;
    }
  });

  return merged as T;
}

// Helper function to check if a value is an object (but not null or an array)
function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
