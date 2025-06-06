import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReaderModel } from '@maxmind/geoip2-node';
import { Reader } from '@maxmind/geoip2-node';

const filename = 'GeoLite2-City.mmdb';
// From api or worker package
const dbPath = path.join(__dirname, `../../../packages/geo/${filename}`);
// From local package
const dbPathLocal = path.join(__dirname, `../${filename}`);

let reader: ReaderModel | null = null;

async function loadDatabase(dbPath: string) {
  try {
    const dbBuffer = await readFile(dbPath);
    reader = Reader.openBuffer(dbBuffer);
    console.log('GeoLite2-City.mmdb loaded (dist)');
  } catch (error) {
    try {
      const dbBuffer = await readFile(dbPathLocal);
      reader = Reader.openBuffer(dbBuffer);
      console.log('GeoLite2-City.mmdb loaded (local)');
    } catch (error) {
      console.error('GeoLite2-City.mmdb not found');
    }
  }
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
