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
  timeRanges,
} from '@mixan/constants';
import { mapKeys } from '@mixan/validation';

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
    parseAsStringEnum(mapKeys(timeRanges))
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
    setRange,
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
