// Moved from packages/common/src/math.ts and
// packages/common/src/get-previous-metric.ts (M11-006, ADR-007 shared/ layout).
// `isFloat` does NOT come along: no importer, anywhere.
//
// `isNumber` is mathjs's, not `typeof n === 'number'` — it is the filter
// predicate for every chart aggregate below, so it stays exactly as it was.
import { isNumber } from 'mathjs';
import { isNil } from 'ramda';
import type { PreviousValue } from '../modules/report/report.constants';

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

export function getPreviousMetric(
  current: number,
  previous: number | null | undefined
): PreviousValue {
  if (isNil(previous)) {
    return undefined;
  }

  const diff = round(
    ((current > previous
      ? current / previous
      : current < previous
        ? previous / current
        : 0) -
      1) *
      100,
    1
  );

  return {
    diff:
      Number.isNaN(diff) || !Number.isFinite(diff) || current === previous
        ? null
        : diff,
    state:
      current > previous
        ? 'positive'
        : current < previous
          ? 'negative'
          : 'neutral',
    value: previous,
  };
}
