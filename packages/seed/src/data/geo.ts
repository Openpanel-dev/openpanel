import type { Geo } from '../model';
import type { Rng, Weighted } from '../rng';

interface City {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  /** A /16 GeoIP attributes to roughly this region; only decorates `x-client-ip`-style data. */
  ipPrefix: string;
}

const CITIES: readonly Weighted<City>[] = [
  {
    weight: 14,
    value: {
      country: 'SE',
      region: 'Stockholm',
      city: 'Stockholm',
      latitude: 59.33,
      longitude: 18.07,
      ipPrefix: '83.233',
    },
  },
  {
    weight: 4,
    value: {
      country: 'SE',
      region: 'Västra Götaland',
      city: 'Gothenburg',
      latitude: 57.71,
      longitude: 11.97,
      ipPrefix: '83.250',
    },
  },
  {
    weight: 3,
    value: {
      country: 'SE',
      region: 'Skåne',
      city: 'Malmö',
      latitude: 55.6,
      longitude: 13.0,
      ipPrefix: '90.230',
    },
  },
  {
    weight: 16,
    value: {
      country: 'US',
      region: 'California',
      city: 'San Francisco',
      latitude: 37.77,
      longitude: -122.42,
      ipPrefix: '104.28',
    },
  },
  {
    weight: 10,
    value: {
      country: 'US',
      region: 'New York',
      city: 'New York',
      latitude: 40.71,
      longitude: -74.01,
      ipPrefix: '74.72',
    },
  },
  {
    weight: 5,
    value: {
      country: 'US',
      region: 'Texas',
      city: 'Austin',
      latitude: 30.27,
      longitude: -97.74,
      ipPrefix: '70.112',
    },
  },
  {
    weight: 4,
    value: {
      country: 'US',
      region: 'Washington',
      city: 'Seattle',
      latitude: 47.61,
      longitude: -122.33,
      ipPrefix: '73.140',
    },
  },
  {
    weight: 9,
    value: {
      country: 'GB',
      region: 'England',
      city: 'London',
      latitude: 51.51,
      longitude: -0.13,
      ipPrefix: '81.2',
    },
  },
  {
    weight: 3,
    value: {
      country: 'GB',
      region: 'England',
      city: 'Manchester',
      latitude: 53.48,
      longitude: -2.24,
      ipPrefix: '86.20',
    },
  },
  {
    weight: 7,
    value: {
      country: 'DE',
      region: 'Berlin',
      city: 'Berlin',
      latitude: 52.52,
      longitude: 13.41,
      ipPrefix: '77.12',
    },
  },
  {
    weight: 3,
    value: {
      country: 'DE',
      region: 'Bavaria',
      city: 'Munich',
      latitude: 48.14,
      longitude: 11.58,
      ipPrefix: '84.153',
    },
  },
  {
    weight: 4,
    value: {
      country: 'NL',
      region: 'North Holland',
      city: 'Amsterdam',
      latitude: 52.37,
      longitude: 4.9,
      ipPrefix: '77.160',
    },
  },
  {
    weight: 4,
    value: {
      country: 'FR',
      region: 'Île-de-France',
      city: 'Paris',
      latitude: 48.86,
      longitude: 2.35,
      ipPrefix: '82.64',
    },
  },
  {
    weight: 3,
    value: {
      country: 'ES',
      region: 'Madrid',
      city: 'Madrid',
      latitude: 40.42,
      longitude: -3.7,
      ipPrefix: '81.32',
    },
  },
  {
    weight: 3,
    value: {
      country: 'DK',
      region: 'Capital Region',
      city: 'Copenhagen',
      latitude: 55.68,
      longitude: 12.57,
      ipPrefix: '80.62',
    },
  },
  {
    weight: 3,
    value: {
      country: 'NO',
      region: 'Oslo',
      city: 'Oslo',
      latitude: 59.91,
      longitude: 10.75,
      ipPrefix: '84.208',
    },
  },
  {
    weight: 3,
    value: {
      country: 'FI',
      region: 'Uusimaa',
      city: 'Helsinki',
      latitude: 60.17,
      longitude: 24.94,
      ipPrefix: '85.76',
    },
  },
  {
    weight: 3,
    value: {
      country: 'PL',
      region: 'Masovian',
      city: 'Warsaw',
      latitude: 52.23,
      longitude: 21.01,
      ipPrefix: '83.4',
    },
  },
  {
    weight: 4,
    value: {
      country: 'CA',
      region: 'Ontario',
      city: 'Toronto',
      latitude: 43.65,
      longitude: -79.38,
      ipPrefix: '99.224',
    },
  },
  {
    weight: 4,
    value: {
      country: 'AU',
      region: 'New South Wales',
      city: 'Sydney',
      latitude: -33.87,
      longitude: 151.21,
      ipPrefix: '1.128',
    },
  },
  {
    weight: 4,
    value: {
      country: 'IN',
      region: 'Karnataka',
      city: 'Bengaluru',
      latitude: 12.97,
      longitude: 77.59,
      ipPrefix: '49.204',
    },
  },
  {
    weight: 3,
    value: {
      country: 'BR',
      region: 'São Paulo',
      city: 'São Paulo',
      latitude: -23.55,
      longitude: -46.63,
      ipPrefix: '177.220',
    },
  },
  {
    weight: 3,
    value: {
      country: 'JP',
      region: 'Tokyo',
      city: 'Tokyo',
      latitude: 35.68,
      longitude: 139.69,
      ipPrefix: '126.0',
    },
  },
  {
    weight: 2,
    value: {
      country: 'SG',
      region: '',
      city: 'Singapore',
      latitude: 1.35,
      longitude: 103.82,
      ipPrefix: '116.14',
    },
  },
  {
    weight: 2,
    value: {
      country: 'ZA',
      region: 'Western Cape',
      city: 'Cape Town',
      latitude: -33.92,
      longitude: 18.42,
      ipPrefix: '41.13',
    },
  },
  {
    weight: 2,
    value: {
      country: 'MX',
      region: 'Mexico City',
      city: 'Mexico City',
      latitude: 19.43,
      longitude: -99.13,
      ipPrefix: '187.188',
    },
  },
  {
    weight: 2,
    value: {
      country: 'IE',
      region: 'Leinster',
      city: 'Dublin',
      latitude: 53.35,
      longitude: -6.26,
      ipPrefix: '86.43',
    },
  },
  {
    weight: 2,
    value: {
      country: 'CH',
      region: 'Zurich',
      city: 'Zurich',
      latitude: 47.38,
      longitude: 8.54,
      ipPrefix: '85.5',
    },
  },
];

/** Lat/lon jitter so map views do not stack every visitor of a city on one pixel. */
const COORDINATE_JITTER = 0.05;
const COORDINATE_DECIMALS = 4;

function round(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}

export function newGeo(rng: Rng): Geo {
  const city = rng.pick(CITIES);
  return {
    ip: `${city.ipPrefix}.${rng.int(1, 254)}.${rng.int(1, 254)}`,
    country: city.country,
    region: city.region,
    city: city.city,
    latitude: round(city.latitude + rng.normal() * COORDINATE_JITTER),
    longitude: round(city.longitude + rng.normal() * COORDINATE_JITTER),
  };
}
