import { useMemo } from 'react';
import type { IChartInput } from '@/types';

// prettier-ignore
import type { Options as NuqsOptions, UseQueryStateReturn } from 'nuqs';

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

export function useEventQueryFilters(options: NuqsOptions = {}) {
  // Ignore prettier so that we have all one same line
  // prettier-ignore
  return {
    path: useFix(useQueryState('path', parseAsString.withOptions({...nuqsOptions, ...options}))),
    referrer: useFix(useQueryState('referrer', parseAsString.withOptions({...nuqsOptions, ...options}))),
    referrerName: useFix(useQueryState('referrerName',parseAsString.withOptions({...nuqsOptions, ...options}))),
    referrerType: useFix(useQueryState('referrerType',parseAsString.withOptions({...nuqsOptions, ...options}))),
    utmSource: useFix(useQueryState('utmSource',parseAsString.withOptions({...nuqsOptions, ...options}))),
    utmMedium: useFix(useQueryState('utmMedium',parseAsString.withOptions({...nuqsOptions, ...options}))),
    utmCampaign: useFix(useQueryState('utmCampaign',parseAsString.withOptions({...nuqsOptions, ...options}))),
    utmContent: useFix(useQueryState('utmContent',parseAsString.withOptions({...nuqsOptions, ...options}))),
    utmTerm: useFix(useQueryState('utmTerm', parseAsString.withOptions({...nuqsOptions, ...options}))),
    continent: useFix(useQueryState('continent', parseAsString.withOptions({...nuqsOptions, ...options}))),
    country: useFix(useQueryState('country', parseAsString.withOptions({...nuqsOptions, ...options}))),
    region: useFix(useQueryState('region', parseAsString.withOptions({...nuqsOptions, ...options}))),
    city: useFix(useQueryState('city', parseAsString.withOptions({...nuqsOptions, ...options}))),
    device: useFix(useQueryState('device', parseAsString.withOptions({...nuqsOptions, ...options}))),
    browser: useFix(useQueryState('browser', parseAsString.withOptions({...nuqsOptions, ...options}))),
    browserVersion: useFix(useQueryState('browserVersion',parseAsString.withOptions({...nuqsOptions, ...options}))),
    os: useFix(useQueryState('os', parseAsString.withOptions({...nuqsOptions, ...options}))),
    osVersion: useFix(useQueryState('osVersion',parseAsString.withOptions({...nuqsOptions, ...options}))),
    brand: useFix(useQueryState('brand',parseAsString.withOptions({...nuqsOptions, ...options}))),
    model: useFix(useQueryState('model',parseAsString.withOptions({...nuqsOptions, ...options}))),
  } as const;
}

export function useEventFilters() {
  const eventQueryFilters = useEventQueryFilters();

  const filters = useMemo(() => {
    return getEventFilters({
      path: eventQueryFilters.path.get,
      device: eventQueryFilters.device.get,
      referrer: eventQueryFilters.referrer.get,
      referrerName: eventQueryFilters.referrerName.get,
      referrerType: eventQueryFilters.referrerType.get,
      utmSource: eventQueryFilters.utmSource.get,
      utmMedium: eventQueryFilters.utmMedium.get,
      utmCampaign: eventQueryFilters.utmCampaign.get,
      utmContent: eventQueryFilters.utmContent.get,
      utmTerm: eventQueryFilters.utmTerm.get,
      continent: eventQueryFilters.continent.get,
      country: eventQueryFilters.country.get,
      region: eventQueryFilters.region.get,
      city: eventQueryFilters.city.get,
      browser: eventQueryFilters.browser.get,
      browserVersion: eventQueryFilters.browserVersion.get,
      os: eventQueryFilters.os.get,
      osVersion: eventQueryFilters.osVersion.get,
      brand: eventQueryFilters.brand.get,
      model: eventQueryFilters.model.get,
    });
  }, [
    eventQueryFilters.path.get,
    eventQueryFilters.device.get,
    eventQueryFilters.referrer.get,
    eventQueryFilters.referrerName.get,
    eventQueryFilters.referrerType.get,
    eventQueryFilters.utmSource.get,
    eventQueryFilters.utmMedium.get,
    eventQueryFilters.utmCampaign.get,
    eventQueryFilters.utmContent.get,
    eventQueryFilters.utmTerm.get,
    eventQueryFilters.continent.get,
    eventQueryFilters.country.get,
    eventQueryFilters.region.get,
    eventQueryFilters.city.get,
    eventQueryFilters.browser.get,
    eventQueryFilters.browserVersion.get,
    eventQueryFilters.os.get,
    eventQueryFilters.osVersion.get,
    eventQueryFilters.model.get,
    eventQueryFilters.brand.get,
  ]);

  return filters;
}

export function getEventFilters({
  path,
  device,
  referrer,
  referrerName,
  referrerType,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
  utmTerm,
  continent,
  country,
  region,
  city,
  browser,
  browserVersion,
  os,
  osVersion,
  brand,
  model,
}: {
  path: string | null;
  device: string | null;
  referrer: string | null;
  referrerName: string | null;
  referrerType: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  continent: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  brand: string | null;
  model: string | null;
}) {
  const filters: IChartInput['events'][number]['filters'] = [];

  if (path) {
    filters.push({
      id: 'path',
      operator: 'is',
      name: 'path' as const,
      value: [path],
    });
  }

  if (device) {
    filters.push({
      id: 'device',
      operator: 'is',
      name: 'device' as const,
      value: [device],
    });
  }

  if (referrer) {
    filters.push({
      id: 'referrer',
      operator: 'is',
      name: 'referrer' as const,
      value: [referrer],
    });
  }

  if (referrerName) {
    filters.push({
      id: 'referrerName',
      operator: 'is',
      name: 'referrer_name' as const,
      value: [referrerName],
    });
  }

  if (referrerType) {
    filters.push({
      id: 'referrerType',
      operator: 'is',
      name: 'referrer_type' as const,
      value: [referrerType],
    });
  }

  if (utmSource) {
    filters.push({
      id: 'utmSource',
      operator: 'is',
      name: 'properties.query.utm_source' as const,
      value: [utmSource],
    });
  }

  if (utmMedium) {
    filters.push({
      id: 'utmMedium',
      operator: 'is',
      name: 'properties.query.utm_medium' as const,
      value: [utmMedium],
    });
  }

  if (utmCampaign) {
    filters.push({
      id: 'utmCampaign',
      operator: 'is',
      name: 'properties.query.utm_campaign' as const,
      value: [utmCampaign],
    });
  }

  if (utmContent) {
    filters.push({
      id: 'utmContent',
      operator: 'is',
      name: 'properties.query.utm_content' as const,
      value: [utmContent],
    });
  }

  if (utmTerm) {
    filters.push({
      id: 'utmTerm',
      operator: 'is',
      name: 'properties.query.utm_term' as const,
      value: [utmTerm],
    });
  }

  if (continent) {
    filters.push({
      id: 'continent',
      operator: 'is',
      name: 'continent' as const,
      value: [continent],
    });
  }

  if (country) {
    filters.push({
      id: 'country',
      operator: 'is',
      name: 'country' as const,
      value: [country],
    });
  }

  if (region) {
    filters.push({
      id: 'region',
      operator: 'is',
      name: 'region' as const,
      value: [region],
    });
  }

  if (city) {
    filters.push({
      id: 'city',
      operator: 'is',
      name: 'city' as const,
      value: [city],
    });
  }

  if (browser) {
    filters.push({
      id: 'browser',
      operator: 'is',
      name: 'browser' as const,
      value: [browser],
    });
  }

  if (browserVersion) {
    filters.push({
      id: 'browserVersion',
      operator: 'is',
      name: 'browser_version' as const,
      value: [browserVersion],
    });
  }

  if (os) {
    filters.push({
      id: 'os',
      operator: 'is',
      name: 'os' as const,
      value: [os],
    });
  }

  if (osVersion) {
    filters.push({
      id: 'osVersion',
      operator: 'is',
      name: 'os_version' as const,
      value: [osVersion],
    });
  }

  if (brand) {
    filters.push({
      id: 'brand',
      operator: 'is',
      name: 'brand' as const,
      value: [brand],
    });
  }

  if (model) {
    filters.push({
      id: 'model',
      operator: 'is',
      name: 'model' as const,
      value: [model],
    });
  }

  return filters;
}
