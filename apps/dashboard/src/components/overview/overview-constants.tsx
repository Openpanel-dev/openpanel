import type { IGetTopGenericInput } from '@openpanel/db';

export const OVERVIEW_COLUMNS_NAME: Record<
  IGetTopGenericInput['column'],
  string
> = {
  country: 'Country',
  region: 'Region',
  city: 'City',
  browser: 'Browser',
  brand: 'Brand',
  os: 'OS',
  device: 'Device',
  browser_version: 'Browser version',
  os_version: 'OS version',
  model: 'Model',
  referrer: 'Referrer',
  referrer_name: 'Referrer name',
  referrer_type: 'Referrer type',
  utm_source: 'UTM source',
  utm_medium: 'UTM medium',
  utm_campaign: 'UTM campaign',
  utm_term: 'UTM term',
  utm_content: 'UTM content',
};

export const OVERVIEW_COLUMNS_NAME_PLURAL: Record<
  IGetTopGenericInput['column'],
  string
> = {
  country: 'Countries',
  region: 'Regions',
  city: 'Cities',
  browser: 'Browsers',
  brand: 'Brands',
  os: 'OSs',
  device: 'Devices',
  browser_version: 'Browser versions',
  os_version: 'OS versions',
  model: 'Models',
  referrer: 'Referrers',
  referrer_name: 'Referrer names',
  referrer_type: 'Referrer types',
  utm_source: 'UTM sources',
  utm_medium: 'UTM mediums',
  utm_campaign: 'UTM campaigns',
  utm_term: 'UTM terms',
  utm_content: 'UTM contents',
};
