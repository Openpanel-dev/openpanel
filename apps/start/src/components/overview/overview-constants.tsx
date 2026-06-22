import type { IGetTopGenericInput } from '@openpanel/db';

export const OVERVIEW_COLUMN_LABEL_KEYS: Record<
  IGetTopGenericInput['column'],
  string
> = {
  country: 'overview.column_country',
  region: 'overview.column_region',
  city: 'overview.column_city',
  browser: 'overview.column_browser',
  brand: 'overview.column_brand',
  os: 'overview.column_os',
  device: 'overview.column_device',
  browser_version: 'overview.column_browser_version',
  os_version: 'overview.column_os_version',
  model: 'overview.column_model',
  referrer: 'overview.column_referrer',
  referrer_name: 'overview.column_referrer_name',
  referrer_type: 'overview.column_referrer_type',
  utm_source: 'overview.column_utm_source',
  utm_medium: 'overview.column_utm_medium',
  utm_campaign: 'overview.column_utm_campaign',
  utm_term: 'overview.column_utm_term',
  utm_content: 'overview.column_utm_content',
};

export const OVERVIEW_COLUMN_PLURAL_LABEL_KEYS: Record<
  IGetTopGenericInput['column'],
  string
> = {
  country: 'overview.column_countries',
  region: 'overview.column_regions',
  city: 'overview.column_cities',
  browser: 'overview.column_browsers',
  brand: 'overview.column_brands',
  os: 'overview.column_oss',
  device: 'overview.column_devices',
  browser_version: 'overview.column_browser_versions',
  os_version: 'overview.column_os_versions',
  model: 'overview.column_models',
  referrer: 'overview.column_referrers',
  referrer_name: 'overview.column_referrer_names',
  referrer_type: 'overview.column_referrer_types',
  utm_source: 'overview.column_utm_sources',
  utm_medium: 'overview.column_utm_mediums',
  utm_campaign: 'overview.column_utm_campaigns',
  utm_term: 'overview.column_utm_terms',
  utm_content: 'overview.column_utm_contents',
};

export function getOverviewColumnNameKey(
  column: IGetTopGenericInput['column'],
) {
  return OVERVIEW_COLUMN_LABEL_KEYS[column];
}

export function getOverviewColumnNamePluralKey(
  column: IGetTopGenericInput['column'],
) {
  return OVERVIEW_COLUMN_PLURAL_LABEL_KEYS[column];
}
