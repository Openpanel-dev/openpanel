import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReaderModel } from '@maxmind/geoip2-node';
import { Reader } from '@maxmind/geoip2-node';
import { LRUCache } from 'lru-cache';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filename = 'GeoLite2-City.mmdb';
// From api or worker package
const dbPath = path.join(__dirname, `../../../packages/geo/${filename}`);
// From local package
const dbPathLocal = path.join(__dirname, `../${filename}`);

// Singleton promise - initialized once, awaited on every call
let readerPromise: Promise<ReaderModel | null> | null = null;

async function loadDatabase(): Promise<ReaderModel | null> {
  try {
    const dbBuffer = await readFile(dbPath);
    console.log('GeoLite2-City.mmdb loaded (dist)');
    return Reader.openBuffer(dbBuffer);
  } catch {
    try {
      const dbBuffer = await readFile(dbPathLocal);
      console.log('GeoLite2-City.mmdb loaded (local)');
      return Reader.openBuffer(dbBuffer);
    } catch {
      console.error('GeoLite2-City.mmdb not found');
      return null;
    }
  }
}

function getReader(): Promise<ReaderModel | null> {
  if (!readerPromise) {
    readerPromise = loadDatabase();
  }
  return readerPromise;
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

const cache = new LRUCache<string, GeoLocation>({
  max: 1000,
  ttl: 1000 * 60 * 5,
  ttlAutopurge: true,
});

export async function getGeoLocation(ip?: string): Promise<GeoLocation> {
  if (!ip || ignore.includes(ip)) {
    return DEFAULT_GEO;
  }

  const cached = cache.get(ip);
  if (cached) {
    return cached;
  }

  const reader = await getReader();

  try {
    const response = reader?.city(ip);
    const res = {
      city: response?.city?.names.en,
      country: response?.country?.isoCode,
      region: response?.subdivisions?.[0]?.names.en,
      longitude: response?.location?.longitude,
      latitude: response?.location?.latitude,
    };
    cache.set(ip, res);
    return res;
  } catch (error) {
    return DEFAULT_GEO;
  }
}
