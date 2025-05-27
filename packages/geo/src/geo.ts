import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReaderModel } from '@maxmind/geoip2-node';
import { Reader } from '@maxmind/geoip2-node';

// Find the package root directory
const packageRoot = path.dirname(
  require.resolve('@openpanel/geo/package.json'),
);
const dbPath = path.join(packageRoot, 'GeoLite2-City.mmdb');

console.log({ __dirname, __filename, packageRoot, dbPath });

let reader: ReaderModel | null = null;

async function loadDatabase(dbPath: string) {
  const dbBuffer = await readFile(dbPath);
  reader = Reader.openBuffer(dbBuffer);
}

export interface GeoLocation {
  country: string | undefined;
  city: string | undefined;
  region: string | undefined;
  longitude: number | undefined;
  latitude: number | undefined;
}

const DEFAULT_GEO: GeoLocation = {
  country: undefined,
  city: undefined,
  region: undefined,
  longitude: undefined,
  latitude: undefined,
};

const ignore = ['127.0.0.1', '::1'];

export async function getGeoLocation(ip?: string): Promise<GeoLocation> {
  if (!ip || ignore.includes(ip)) {
    return DEFAULT_GEO;
  }

  if (!reader) {
    await loadDatabase(dbPath);
  }

  try {
    const response = await reader?.city(ip);
    return {
      city: response?.city?.names.en,
      country: response?.country?.isoCode,
      region: response?.subdivisions?.[0]?.names.en,
      longitude: response?.location?.longitude,
      latitude: response?.location?.latitude,
    };
  } catch (error) {
    return DEFAULT_GEO;
  }
}
