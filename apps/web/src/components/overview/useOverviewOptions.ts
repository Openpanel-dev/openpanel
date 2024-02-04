import { useMemo } from 'react';
import type { IChartInput } from '@/types';
import { getDefaultIntervalByRange, timeRanges } from '@/utils/constants';
import { mapKeys } from '@/utils/validation';
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';

const nuqsOptions = { history: 'push' } as const;

export function useOverviewOptions() {
  const [previous, setPrevious] = useQueryState(
    'name',
    parseAsBoolean.withDefault(true).withOptions(nuqsOptions)
  );
  const [range, setRange] = useQueryState(
    'range',
    parseAsStringEnum(mapKeys(timeRanges))
      .withDefault('7d')
      .withOptions(nuqsOptions)
  );
  const interval = getDefaultIntervalByRange(range);
  const [metric, setMetric] = useQueryState(
    'metric',
    parseAsInteger.withDefault(0).withOptions(nuqsOptions)
  );

  // Filters
  const [referrer, setReferrer] = useQueryState(
    'referrer',
    parseAsString.withOptions(nuqsOptions)
  );
  const [device, setDevice] = useQueryState(
    'device',
    parseAsString.withOptions(nuqsOptions)
  );
  const [page, setPage] = useQueryState(
    'page',
    parseAsString.withOptions(nuqsOptions)
  );

  const [utmSource, setUtmSource] = useQueryState(
    'utm_source',
    parseAsString.withOptions(nuqsOptions)
  );
  const [utmMedium, setUtmMedium] = useQueryState(
    'utm_medium',
    parseAsString.withOptions(nuqsOptions)
  );
  const [utmCampaign, setUtmCampaign] = useQueryState(
    'utm_campaign',
    parseAsString.withOptions(nuqsOptions)
  );
  const [utmContent, setUtmContent] = useQueryState(
    'utm_content',
    parseAsString.withOptions(nuqsOptions)
  );
  const [utmTerm, setUtmTerm] = useQueryState(
    'utm_term',
    parseAsString.withOptions(nuqsOptions)
  );

  const [country, setCountry] = useQueryState(
    'country',
    parseAsString.withOptions(nuqsOptions)
  );
  const [region, setRegion] = useQueryState(
    'region',
    parseAsString.withOptions(nuqsOptions)
  );
  const [city, setCity] = useQueryState(
    'city',
    parseAsString.withOptions(nuqsOptions)
  );

  const filters = useMemo(() => {
    const filters: IChartInput['events'][number]['filters'] = [];
    if (referrer) {
      filters.push({
        id: 'referrer',
        operator: 'is',
        name: 'referrer',
        value: [referrer],
      });
    }

    if (page) {
      filters.push({
        id: 'path',
        operator: 'is',
        name: 'path',
        value: [page],
      });
    }

    if (device) {
      filters.push({
        id: 'device',
        operator: 'is',
        name: 'device',
        value: [device],
      });
    }

    if (utmSource) {
      filters.push({
        id: 'utm_source',
        operator: 'is',
        name: 'properties.query.utm_source',
        value: [utmSource],
      });
    }

    if (utmMedium) {
      filters.push({
        id: 'utm_medium',
        operator: 'is',
        name: 'properties.query.utm_medium',
        value: [utmMedium],
      });
    }

    if (utmCampaign) {
      filters.push({
        id: 'utm_campaign',
        operator: 'is',
        name: 'properties.query.utm_campaign',
        value: [utmCampaign],
      });
    }

    if (utmContent) {
      filters.push({
        id: 'utm_content',
        operator: 'is',
        name: 'properties.query.utm_content',
        value: [utmContent],
      });
    }

    if (utmTerm) {
      filters.push({
        id: 'utm_term',
        operator: 'is',
        name: 'properties.query.utm_term',
        value: [utmTerm],
      });
    }

    if (country) {
      filters.push({
        id: 'country',
        operator: 'is',
        name: 'country',
        value: [country],
      });
    }

    if (region) {
      filters.push({
        id: 'region',
        operator: 'is',
        name: 'region',
        value: [region],
      });
    }

    if (city) {
      filters.push({
        id: 'city',
        operator: 'is',
        name: 'city',
        value: [city],
      });
    }

    return filters;
  }, [
    referrer,
    page,
    device,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    country,
    region,
    city,
  ]);

  return {
    previous,
    setPrevious,
    range,
    setRange,
    metric,
    setMetric,
    referrer,
    setReferrer,
    device,
    setDevice,
    page,
    setPage,

    // Computed
    interval,
    filters,

    // UTM
    utmSource,
    setUtmSource,
    utmMedium,
    setUtmMedium,
    utmCampaign,
    setUtmCampaign,
    utmContent,
    setUtmContent,
    utmTerm,
    setUtmTerm,

    // GEO
    country,
    setCountry,
    region,
    setRegion,
    city,
    setCity,
  };
}
