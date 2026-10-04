// The dashboard's copy of
// packages/core/src/modules/report/src/previous-metric.ts.
//
// The six generic aggregates and `shortId` that used to sit beside it live in
// @openpanel/shared, which the dashboard imports directly. This one function
// stays duplicated: it returns `PreviousValue`, report vocabulary that stays
// out of @openpanel/shared, and apps/start cannot value-import core outside a
// `*.constants.ts` path. The type is safe to import — it is erased.
import type { PreviousValue } from '@openpanel/core/modules/report/report.constants';
import { round } from '@openpanel/shared';
import { isNil } from 'ramda';

export function getPreviousMetric(
  current: number,
  previous: number | null | undefined
): PreviousValue {
  if (isNil(previous)) {
    return undefined;
  }

  const diff = round(
    (Math.abs(current - previous) / Math.abs(previous)) * 100,
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
