import { getSafeJson } from '@openpanel/json';

const parseScalar = (v: any): any => {
  if (Array.isArray(v)) return v.map(parseScalar);
  if (typeof v === 'object' && v !== null) return parseQueryString(v);
  if (
    typeof v === 'string' &&
    /^-?[0-9]+(\.[0-9]+)?$/i.test(v) &&
    !Number.isNaN(Number.parseFloat(v))
  )
    return Number.parseFloat(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (typeof v === 'string') {
    const json = getSafeJson(v);
    if (json !== null) return json;
    return v;
  }
  return null;
};

export const parseQueryString = (obj: Record<string, any>): any => {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, parseScalar(v)]),
  );
};
