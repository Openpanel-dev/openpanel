const properties = {
  has_profile: 'Has a profile',
  name: 'Name',
  path: 'Path',
  origin: 'Origin',
  referrer: 'Referrer',
  referrer_name: 'Referrer name',
  duration: 'Duration',
  created_at: 'Created at',
  country: 'Country',
  city: 'City',
  region: 'Region',
  os: 'OS',
  os_version: 'OS version',
  browser: 'Browser',
  browser_version: 'Browser version',
  device: 'Device',
  brand: 'Brand',
  model: 'Model',
};

export function getPropertyLabel(property: string) {
  return properties[property as keyof typeof properties] || property;
}
