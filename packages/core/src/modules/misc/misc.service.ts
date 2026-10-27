import { getCache, getRedisCache } from '@openpanel/redis';
import { chQuery } from '../../ch-query';
import { type GeoLocation, getGeoLocation } from '../../clients/geo';
import type { CoreConfig } from '../../config';
import type { Logger } from '../../logger';
import type { ServiceDeps, Services } from '../../services';
import { formatClickhouseDate } from '../../shared/ch-dates';
import { TABLE_NAMES } from '../../shared/ch-tables';
import {
  DEFAULT_IP_HEADER_ORDER,
  getClientIpFromHeaders,
} from '../../shared/get-client-ip';
import { FAVICON_PROVIDERS, fetchProviderIcon } from './src/favicon-providers';
import { hostnameFromInput } from './src/hostname';

const CACHE_TTL_SECONDS = 60 * 60 * 24;
const CACHED_ASSET_CACHE_CONTROL = 'public, max-age=604800, immutable'; // 7d
const FRESH_ASSET_CACHE_CONTROL = 'public, max-age=3600, immutable'; // 1h
const STATS_CACHE_TTL_SECONDS = 60 * 60;
const STATS_CACHE_KEY = 'api:stats';

export interface ImageAssetOk {
  status: 200;
  buffer: Buffer;
  headers: Record<string, string>;
}
export interface ImageAssetFailure {
  status: 404;
  body: string;
  headers: Record<string, string>;
}
export type ImageAssetResult = ImageAssetOk | ImageAssetFailure;

// v4: keyed by hostname. Earlier namespaces were keyed by the caller's URL and
// held bytes rasterized from it.
function createCacheKey(hostname: string): string {
  return `favicon:v4:${hostname}`;
}

// Reaches the redis singleton directly: callers of these two functions hold no `deps`/`ctx`.
async function getFromCacheBinary(
  key: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const redis = getRedisCache();
  const [bufferBase64, contentType] = await Promise.all([
    redis.get(key),
    redis.get(`${key}:ctype`),
  ]);
  if (!(bufferBase64 && contentType)) {
    return null;
  }
  return { buffer: Buffer.from(bufferBase64, 'base64'), contentType };
}

async function setToCacheBinary(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const redis = getRedisCache();
  await Promise.all([
    redis.set(key, buffer.toString('base64'), 'EX', CACHE_TTL_SECONDS),
    redis.set(`${key}:ctype`, contentType, 'EX', CACHE_TTL_SECONDS),
  ]);
}

function imageHeaders(
  contentType: string,
  cacheControl: string
): Record<string, string> {
  return {
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'cross-origin',
    'cache-control': cacheControl,
  };
}

function imageOk(
  buffer: Buffer,
  contentType: string,
  cacheControl: string
): ImageAssetOk {
  return {
    status: 200,
    buffer,
    headers: imageHeaders(contentType, cacheControl),
  };
}

function notFound(): ImageAssetFailure {
  return {
    status: 404,
    body: 'Not found',
    headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
  };
}

/** `GET /misc/favicon?url=` — the site's icon as the icon services have it, unmodified. */
export async function getFavicon(
  rawUrl: string | undefined,
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>
): Promise<ImageAssetResult> {
  const hostname = hostnameFromInput(rawUrl);
  if (!hostname) {
    return notFound();
  }

  try {
    // The cache is an optimisation: a Redis failure must not turn a lookup
    // into a 404 or discard an icon that was just fetched.
    const cacheKey = createCacheKey(hostname);
    const cached = await getFromCacheBinary(cacheKey).catch((error) => {
      logger?.warn({ err: error, hostname }, 'Favicon cache read failed');
      return null;
    });
    if (cached) {
      return imageOk(
        cached.buffer,
        cached.contentType,
        CACHED_ASSET_CACHE_CONTROL
      );
    }

    for (const provider of FAVICON_PROVIDERS) {
      const icon = await fetchProviderIcon(provider(hostname), logger);
      if (!icon) {
        continue;
      }
      await setToCacheBinary(cacheKey, icon.buffer, icon.contentType).catch(
        (error) => {
          logger?.warn({ err: error, hostname }, 'Favicon cache write failed');
        }
      );
      return imageOk(icon.buffer, icon.contentType, FRESH_ASSET_CACHE_CONTROL);
    }
    return notFound();
  } catch (error) {
    logger?.error?.({ err: error, hostname }, 'Favicon lookup failed');
    return notFound();
  }
}

export interface StatsResult {
  projectsCount: number;
  eventsCount: number;
  eventsLast24hCount: number;
}

export async function getStats(deps: ServiceDeps): Promise<StatsResult> {
  const res = await getCache(
    STATS_CACHE_KEY,
    STATS_CACHE_TTL_SECONDS,
    async () => {
      const projects = await chQuery<{ project_id: string; count: number }>(
        deps,
        `SELECT project_id, count(*) as count from ${TABLE_NAMES.events} GROUP by project_id order by count()`
      );
      const last24h = await chQuery<{ count: number }>(
        deps,
        `SELECT count(*) as count from ${TABLE_NAMES.events} WHERE created_at > now() - interval '24 hours'`
      );
      return { projects, last24hCount: last24h[0]?.count || 0 };
    }
  );

  return {
    projectsCount: res.projects.length,
    eventsCount: res.projects.reduce((acc, { count }) => acc + count, 0),
    eventsLast24hCount: res.last24hCount,
  };
}

export interface PingRecord {
  domain: string;
  count: number;
}

/** `POST /misc/ping` — records a self-hosted instance's telemetry ping. */
export async function insertPingRecord(
  deps: ServiceDeps,
  record: PingRecord
): Promise<void> {
  await deps.ch.insert({
    table: TABLE_NAMES.self_hosting,
    values: [
      {
        domain: record.domain,
        count: record.count,
        created_at: formatClickhouseDate(new Date(), true),
      },
    ],
    format: 'JSONEachRow',
  });
}

export interface GeoReportEntry {
  ip: string;
  header: string;
  geo: GeoLocation;
}
export type GeoReport =
  | { ok: false }
  | {
      ok: true;
      selected: GeoReportEntry;
      others: Record<string, GeoReportEntry>;
    };

export async function getGeoReport(
  config: CoreConfig,
  headers: Record<string, string | string[] | undefined> | Headers
): Promise<GeoReport> {
  const { ip, header } = getClientIpFromHeaders(config.ipHeaders, headers);
  const others = await Promise.all(
    DEFAULT_IP_HEADER_ORDER.map(async (headerName) => {
      const { ip: otherIp } = getClientIpFromHeaders(
        config.ipHeaders,
        headers,
        headerName
      );
      return {
        header: headerName,
        ip: otherIp,
        geo: await getGeoLocation(otherIp),
      };
    })
  );

  if (!ip) {
    return { ok: false };
  }

  return {
    ok: true,
    selected: { ip, header, geo: await getGeoLocation(ip) },
    others: others.reduce<Record<string, GeoReportEntry>>((acc, other) => {
      acc[other.header] = other;
      return acc;
    }, {}),
  };
}

/**
 * The outbound half of "ping": a self-hosted instance's own cron job,
 * reporting its event count back to `api.openpanel.dev/misc/ping` (the
 * route above, on OUR side).
 */
export async function runPingCron(deps: ServiceDeps): Promise<unknown> {
  if (deps.config.pingDisabled) {
    return;
  }

  const [res] = await chQuery<{ count: number }>(
    deps,
    `SELECT COUNT(*) as count FROM ${TABLE_NAMES.events}`
  );

  if (typeof res?.count !== 'number') {
    return;
  }

  const response = await fetch('https://api.openpanel.dev/misc/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domain: deps.config.dashboardUrl || undefined,
      count: res.count,
    }),
  });

  if (response.ok) {
    return await response.json();
  }

  throw new Error('Failed to ping the server');
}

export function createMiscService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return { runPingCron: (): Promise<unknown> => runPingCron(deps) };
}
