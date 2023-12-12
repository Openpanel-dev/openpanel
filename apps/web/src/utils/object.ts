import { anyPass, isEmpty, isNil, reject } from 'ramda';

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

export const strip = reject(anyPass([isEmpty, isNil]));
