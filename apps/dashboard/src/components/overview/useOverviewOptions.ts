import { differenceInCalendarMonths } from 'date-fns';
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';

import { setStorageItem } from '@/utils/storage';
import {
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  intervals,
  timeWindows,
} from '@openpanel/constants';
import type { IChartRange } from '@openpanel/validation';
import { mapKeys } from '@openpanel/validation';

const nuqsOptions = { history: 'push' } as const;

export function useOverviewOptions() {
  const [startDate, setStartDate] = useQueryState(
    'start',
    parseAsString.withOptions(nuqsOptions),
  );
  const [endDate, setEndDate] = useQueryState(
    'end',
    parseAsString.withOptions(nuqsOptions),
  );
  const [range, setRange] = useQueryState(
    'range',
    parseAsStringEnum(mapKeys(timeWindows))
      .withDefault('7d')
      .withOptions({
        ...nuqsOptions,
        clearOnDefault: false,
      }),
  );
  const [overrideInterval, setInterval] = useQueryState(
    'overrideInterval',
    parseAsStringEnum(mapKeys(intervals)).withOptions({
      ...nuqsOptions,
      clearOnDefault: false,
    }),
  );

  const interval =
    overrideInterval ||
    getDefaultIntervalByDates(startDate, endDate) ||
    getDefaultIntervalByRange(range);

  const [metric, setMetric] = useQueryState(
    'metric',
    parseAsInteger.withDefault(0).withOptions(nuqsOptions),
  );

  return {
    // Skip previous for ranges over 6 months (for performance reasons)
    previous: !(
      range === 'yearToDate' ||
      range === 'lastYear' ||
      (range === 'custom' &&
        startDate &&
        endDate &&
        differenceInCalendarMonths(startDate, endDate) > 6)
    ),
    range,
    setRange: (value: IChartRange | null) => {
      if (value !== 'custom') {
        setStartDate(null);
        setEndDate(null);
        setStorageItem('range', value);
        setInterval(null);
      }
      setRange(value);
    },
    metric,
    setMetric,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    interval,
    setInterval,
  };
}
