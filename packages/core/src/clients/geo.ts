// The one client with no `ProviderError`: both lookups read a bundled MaxMind
// `.mmdb`, so an IP the database does not carry comes back as the default value
// and a database that will not load fails identically on every retry.

import { readFile } from 'node:fs/promises';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReaderModel } from '@maxmind/geoip2-node';
import { Reader } from '@maxmind/geoip2-node';
import { LRUCache } from 'lru-cache';
import datacenterAsns from './datacenter-asns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve a bundled `.mmdb` file, bundled-dist layout first, local package
// second. apps/api bundles every `@openpanel/*` package into one file, so there
// `import.meta.url` is `apps/api/dist/index.js` and three levels up is the repo root.
async function loadDatabase(filename: string): Promise<ReaderModel | null> {
  // The api dist bundle
  const dbPath = path.join(__dirname, `../../../packages/core/${filename}`);
  // The local package (core's own tests, unbundled)
  const dbPathLocal = path.join(__dirname, `../../${filename}`);
  try {
    const dbBuffer = await readFile(dbPath);
    return Reader.openBuffer(dbBuffer);
  } catch {
    try {
      const dbBuffer = await readFile(dbPathLocal);
      return Reader.openBuffer(dbBuffer);
    } catch {
      console.error(`${filename} not found`, { dbPath, dbPathLocal });
      return null;
    }
  }
}

let readerPromise: Promise<ReaderModel | null> | null = null;
let asnReaderPromise: Promise<ReaderModel | null> | null = null;

function getReader(): Promise<ReaderModel | null> {
  if (!readerPromise) {
    readerPromise = loadDatabase('GeoLite2-City.mmdb');
  }
  return readerPromise;
}

function getAsnReader(): Promise<ReaderModel | null> {
  if (!asnReaderPromise) {
    asnReaderPromise = loadDatabase('GeoLite2-ASN.mmdb');
  }
  return asnReaderPromise;
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
  } catch {
    // Cache negative lookups too: the reader throws AddressNotFoundError for
    // absent IPs and re-throwing on every event is wasted work.
    cache.set(ip, DEFAULT_GEO);
    return DEFAULT_GEO;
  }
}

export interface AsnInfo {
  asn: number | undefined;
  org: string | undefined;
  // True when the ASN belongs to a datacenter / hosting provider.
  isHosting: boolean;
}

const DEFAULT_ASN: AsnInfo = {
  asn: undefined,
  org: undefined,
  isHosting: false,
};

const datacenterAsnSet = new Set<number>(datacenterAsns);

const asnCache = new LRUCache<string, AsnInfo>({
  max: 1000,
  ttl: 1000 * 60 * 5,
  ttlAutopurge: true,
});

export async function getAsnInfo(ip?: string): Promise<AsnInfo> {
  if (!ip || ignore.includes(ip)) {
    return DEFAULT_ASN;
  }

  const cached = asnCache.get(ip);
  if (cached) {
    return cached;
  }

  const reader = await getAsnReader();

  try {
    const response = reader?.asn(ip);
    const asn = response?.autonomousSystemNumber;
    const res: AsnInfo = {
      asn,
      org: response?.autonomousSystemOrganization,
      isHosting: asn !== undefined && datacenterAsnSet.has(asn),
    };
    asnCache.set(ip, res);
    return res;
  } catch {
    // Cache negative lookups too: the reader throws AddressNotFoundError for
    // absent IPs and re-throwing on every event is wasted work.
    asnCache.set(ip, DEFAULT_ASN);
    return DEFAULT_ASN;
  }
}
