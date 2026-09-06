// Copied from @openpanel/core/src/shared/math.ts + id.ts (ADR-007/ADR-008:
// frontend-values-only-constants forbids apps/start value-importing core
// outside a *.constants.ts path, so these seven common utils are duplicated
// here rather than re-exported).
//
// `isNumber` is mathjs's, not `typeof n === 'number'` — it is the filter
// predicate for every chart aggregate below, so it stays exactly as it was.

import type { PreviousValue } from '@openpanel/core/modules/report/report.constants';
import { isNumber } from 'mathjs';
import { nanoid } from 'nanoid/non-secure';
import { isNil } from 'ramda';

const SHORT_ID_LENGTH = 4;

export function shortId(): string {
  return nanoid(SHORT_ID_LENGTH);
}

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
