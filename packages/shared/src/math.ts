// `isFloat` does NOT come along: no importer, anywhere.
//
// `getPreviousMetric` left with the report vocabulary it returns — it is
// `packages/core/src/modules/report/src/previous-metric.ts` now.
//
// What was left is generic arithmetic, so it is @openpanel/shared's. apps/start
// had copied all six of these functions verbatim; that copy is deleted and the
// dashboard imports them from here.
//
// `isNumber` is mathjs's, not `typeof n === 'number'` — it is the filter
// predicate for every chart aggregate below, so it stays exactly as it was.
import { isNumber } from 'mathjs';

export const round = (num: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

export const average = (arr: (number | null)[], includeZero = false) => {
  const filtered = arr.filter(
    (n): n is number =>
      isNumber(n) &&
      !Number.isNaN(n) &&
      Number.isFinite(n) &&
      (includeZero || n !== 0)
  );
  const avg = filtered.reduce((p, c) => p + c, 0) / filtered.length;
  return Number.isNaN(avg) ? 0 : avg;
};

export const sum = (arr: (number | null | undefined)[]): number =>
  round(arr.filter(isNumber).reduce((acc, item) => acc + item, 0));

export const min = (arr: (number | null | undefined)[]): number => {
  const filtered = arr.filter(isNumber);
  if (filtered.length === 0) {
    return 0;
  }
  return filtered.reduce((a, b) => (b < a ? b : a), filtered[0]!);
};

export const max = (arr: (number | null | undefined)[]): number => {
  const filtered = arr.filter(isNumber);
  if (filtered.length === 0) {
    return 0;
  }
  return filtered.reduce((a, b) => (b > a ? b : a), filtered[0]!);
};

export const ifNaN = <T extends number>(
  n: number | null | undefined,
  defaultValue: T
): T => (Number.isNaN(n) ? defaultValue : (n as T));
