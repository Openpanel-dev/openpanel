import { getSafeJson } from '@openpanel/common';

export const parseQueryString = (obj: Record<string, any>): any => {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (typeof v === 'object') return [k, parseQueryString(v)];
      if (!isNaN(parseFloat(v))) return [k, parseFloat(v)];
      if (v === 'true') return [k, true];
      if (v === 'false') return [k, false];
      if (typeof v === 'string') {
        if (getSafeJson(v) !== null) {
          return [k, getSafeJson(v)];
        }
        return [k, v];
      }
      return [k, null];
    })
  );
};
