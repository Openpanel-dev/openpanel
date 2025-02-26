import { getSafeJson } from '@openpanel/json';

export const parseQueryString = (obj: Record<string, any>): any => {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (typeof v === 'object') return [k, parseQueryString(v)];
      if (
        /^-?[0-9]+(\.[0-9]+)?$/i.test(v) &&
        !Number.isNaN(Number.parseFloat(v))
      )
        return [k, Number.parseFloat(v)];
      if (v === 'true') return [k, true];
      if (v === 'false') return [k, false];
      if (typeof v === 'string') {
        if (getSafeJson(v) !== null) {
          return [k, getSafeJson(v)];
        }
        return [k, v];
      }
      return [k, null];
    }),
  );
};
