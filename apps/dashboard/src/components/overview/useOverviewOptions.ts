import { useEffect } from 'react';
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';

import {
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  timeWindows,
} from '@openpanel/constants';
import type { IChartRange } from '@openpanel/validation';
import { mapKeys } from '@openpanel/validation';

const nuqsOptions = { history: 'push' } as const;

export function useOverviewOptions() {
  const [previous, setPrevious] = useQueryState(
    'compare',
    parseAsBoolean.withDefault(true).withOptions(nuqsOptions)
  );
  const [startDate, setStartDate] = useQueryState(
    'start',
    parseAsString.withOptions(nuqsOptions)
  );
  const [endDate, setEndDate] = useQueryState(
    'end',
    parseAsString.withOptions(nuqsOptions)
  );
  const [range, setRange] = useQueryState(
    'range',
    parseAsStringEnum(mapKeys(timeWindows))
      .withDefault('7d')
      .withOptions(nuqsOptions)
  );

  const interval =
    getDefaultIntervalByDates(startDate, endDate) ||
    getDefaultIntervalByRange(range);

  const [metric, setMetric] = useQueryState(
    'metric',
    parseAsInteger.withDefault(0).withOptions(nuqsOptions)
  );

  // Toggles
  const [liveHistogram, setLiveHistogram] = useQueryState(
    'live',
    parseAsBoolean.withDefault(true).withOptions(nuqsOptions)
  );

  return {
    previous,
    setPrevious,
    range,
    setRange: (value: IChartRange | null) => {
      if (value !== 'custom') {
        setStartDate(null);
        setEndDate(null);
      }
      setRange(value);
    },
    metric,
    setMetric,
    startDate,
    setStartDate,
    endDate,
    setEndDate,

    // Computed
    interval,

    // Toggles
    liveHistogram,
    setLiveHistogram,
  };
}
