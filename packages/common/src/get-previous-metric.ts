import { isNil } from 'ramda';

import type { PreviousValue } from '@openpanel/validation';

import { round } from './math';

export function getPreviousMetric(
  current: number,
  previous: number | null | undefined,
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
    1,
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
