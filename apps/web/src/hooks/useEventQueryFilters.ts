import { useMemo } from 'react';
import type { IChartInput } from '@/types';

// prettier-ignore
import type { UseQueryStateReturn } from 'nuqs';

import { parseAsString, useQueryState } from 'nuqs';

const nuqsOptions = { history: 'push' } as const;

function useFix<T>(hook: UseQueryStateReturn<T, undefined>) {
  return useMemo(
    () => ({
      get: hook[0],
      set: hook[1],
    }),
    [hook]
  );
}

export function useEventQueryFilters() {
  // Ignore prettier so that we have all one same line
  // prettier-ignore
  return {
    path: useFix(useQueryState('path', parseAsString.withOptions(nuqsOptions))),
    referrer: useFix(useQueryState('referrer', parseAsString.withOptions(nuqsOptions))),
    referrerName: useFix(useQueryState('referrerName',parseAsString.withOptions(nuqsOptions))),
    referrerType: useFix(useQueryState('referrerType',parseAsString.withOptions(nuqsOptions))),
    utmSource: useFix(useQueryState('utmSource',parseAsString.withOptions(nuqsOptions))),
    utmMedium: useFix(useQueryState('utmMedium',parseAsString.withOptions(nuqsOptions))),
    utmCampaign: useFix(useQueryState('utmCampaign',parseAsString.withOptions(nuqsOptions))),
    utmContent: useFix(useQueryState('utmContent',parseAsString.withOptions(nuqsOptions))),
    utmTerm: useFix(useQueryState('utmTerm', parseAsString.withOptions(nuqsOptions))),
    country: useFix(useQueryState('country', parseAsString.withOptions(nuqsOptions))),
    region: useFix(useQueryState('region', parseAsString.withOptions(nuqsOptions))),
    city: useFix(useQueryState('city', parseAsString.withOptions(nuqsOptions))),
    device: useFix(useQueryState('device', parseAsString.withOptions(nuqsOptions))),
    browser: useFix(useQueryState('browser', parseAsString.withOptions(nuqsOptions))),
    browserVersion: useFix(useQueryState('browserVersion',parseAsString.withOptions(nuqsOptions))),
    os: useFix(useQueryState('os', parseAsString.withOptions(nuqsOptions))),
    osVersion: useFix(useQueryState('osVersion',parseAsString.withOptions(nuqsOptions))),
  } as const;
}

export function useEventFilters() {
  const hej = useEventQueryFilters();

  const filters = useMemo(() => {
    const filters: IChartInput['events'][number]['filters'] = [];

    if (hej.path.get) {
      filters.push({
        id: 'path',
        operator: 'is',
        name: 'path' as const,
        value: [hej.path.get],
      });
    }

    if (hej.device.get) {
      filters.push({
        id: 'device',
        operator: 'is',
        name: 'device' as const,
        value: [hej.device.get],
      });
    }

    if (hej.referrer.get) {
      filters.push({
        id: 'referrer',
        operator: 'is',
        name: 'referrer' as const,
        value: [hej.referrer.get],
      });
    }
    console.log('hej.referrerName.get', hej.referrerName.get);

    if (hej.referrerName.get) {
      filters.push({
        id: 'referrerName',
        operator: 'is',
        name: 'referrer_name' as const,
        value: [hej.referrerName.get],
      });
    }

    if (hej.referrerType.get) {
      filters.push({
        id: 'referrerType',
        operator: 'is',
        name: 'referrer_type' as const,
        value: [hej.referrerType.get],
      });
    }

    if (hej.utmSource.get) {
      filters.push({
        id: 'utmSource',
        operator: 'is',
        name: 'properties.query.utm_source' as const,
        value: [hej.utmSource.get],
      });
    }

    if (hej.utmMedium.get) {
      filters.push({
        id: 'utmMedium',
        operator: 'is',
        name: 'properties.query.utm_medium' as const,
        value: [hej.utmMedium.get],
      });
    }

    if (hej.utmCampaign.get) {
      filters.push({
        id: 'utmCampaign',
        operator: 'is',
        name: 'properties.query.utm_campaign' as const,
        value: [hej.utmCampaign.get],
      });
    }

    if (hej.utmContent.get) {
      filters.push({
        id: 'utmContent',
        operator: 'is',
        name: 'properties.query.utm_content' as const,
        value: [hej.utmContent.get],
      });
    }

    if (hej.utmTerm.get) {
      filters.push({
        id: 'utmTerm',
        operator: 'is',
        name: 'properties.query.utm_term' as const,
        value: [hej.utmTerm.get],
      });
    }

    if (hej.country.get) {
      filters.push({
        id: 'country',
        operator: 'is',
        name: 'country' as const,
        value: [hej.country.get],
      });
    }

    if (hej.region.get) {
      filters.push({
        id: 'region',
        operator: 'is',
        name: 'region' as const,
        value: [hej.region.get],
      });
    }

    if (hej.city.get) {
      filters.push({
        id: 'city',
        operator: 'is',
        name: 'city' as const,
        value: [hej.city.get],
      });
    }

    if (hej.browser.get) {
      filters.push({
        id: 'browser',
        operator: 'is',
        name: 'browser' as const,
        value: [hej.browser.get],
      });
    }

    if (hej.browserVersion.get) {
      filters.push({
        id: 'browserVersion',
        operator: 'is',
        name: 'browser_version' as const,
        value: [hej.browserVersion.get],
      });
    }

    if (hej.os.get) {
      filters.push({
        id: 'os',
        operator: 'is',
        name: 'os' as const,
        value: [hej.os.get],
      });
    }

    if (hej.osVersion.get) {
      filters.push({
        id: 'osVersion',
        operator: 'is',
        name: 'os_version' as const,
        value: [hej.osVersion.get],
      });
    }

    return filters;
  }, [
    hej.path,
    hej.device,
    hej.referrer,
    hej.referrerName,
    hej.referrerType,
    hej.utmSource,
    hej.utmMedium,
    hej.utmCampaign,
    hej.utmContent,
    hej.utmTerm,
    hej.country,
    hej.region,
    hej.city,
    hej.browser,
    hej.browserVersion,
    hej.os,
    hej.osVersion,
  ]);

  return filters;
}
