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

  // Change relative to the previous period. The direction lives in `state`,
  // so a drop from 100 to 50 is a 50% decrease, not 100%.
  const diff = round(Math.abs((current - previous) / previous) * 100, 1);

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
