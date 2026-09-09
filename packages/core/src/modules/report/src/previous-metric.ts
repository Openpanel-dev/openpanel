// The previous-period comparison a report card renders. Split out of
// `shared/math.ts` at M15-009 (ADR-022 R22): it returns `PreviousValue`, this
// module's own vocabulary, so it belongs to the report module rather than to
// the layer below every transport. The generic aggregates it is built on stay
// in `shared/math.ts`.

import { round } from '@openpanel/shared';
import { isNil } from 'ramda';
import type { PreviousValue } from '../report.constants';

const PERCENT = 100;
const DIFF_DECIMALS = 1;

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
      PERCENT,
    DIFF_DECIMALS
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
