// The dashboard's copy of
// packages/core/src/modules/report/src/previous-metric.ts.
//
// Moved the six generic aggregates and `shortId` that used to sit beside it
// into @openpanel/shared, which the dashboard now imports directly. This one
// function stays duplicated: it returns `PreviousValue`, report vocabulary, and
// ADR-022 R21 keeps domain constants out of @openpanel/shared while R12 keeps
// apps/start from value-importing core outside a `*.constants.ts` path. The
// type is safe to import — it is erased.
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
