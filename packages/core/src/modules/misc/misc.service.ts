// Ported from apps/api/src/controllers/misc.controller.ts +
// apps/worker/src/jobs/cron.ping.ts. V1's Fastify controller and the worker's
// `cron.ping.ts` stay the LIVE code paths (DELEGATE PATTERN) and call the
// functions below verbatim — no new behaviour.
//
// `GET/POST /misc/og/clear` and `/misc/favicon/clear` are NOT ported: ADR-015
// entry #6 grades them RULED + DEAD (`docs/ANSWERS.md` §1.4 confirms no proxy
// depends on them), so this wave is where V1 drops them too.
//
// The ClickHouse CLIENT is `deps.ch` — reads through ch-query.ts, the one write
// through `deps.ch.insert` — so the `loadCh` lazy import of `@openpanel/db` is
// gone. M15-005 dropped the last hop too: these three statements are raw
// strings, not `sql` fragments, so they still need `TABLE_NAMES` /
// `formatClickhouseDate`, and core owns its own parity-tested copies of both
// (shared/ch-tables.ts, shared/ch-dates.ts, guarded by their `.parity.test.ts`
// siblings). Converting the STATEMENTS is ADR-013's P7 work, not this wave's.
//
// `getCache` is a plain static import. It was lazy to survive core tests that
// partially mock `@openpanel/redis` without a `getCache` export; those mocks
// snapshot the real module and spread it now, so the loader bought nothing.

import crypto from 'node:crypto';
import { getCache, getRedisCache } from '@openpanel/redis';
import {
  assertPublicUrl,
  BlockedUrlError,
  safeFetch,
} from '@openpanel/shared/server';
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
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  normalizeContentType,
  processImage,
  processOgImage,
} from './src/image-proxy';
import { parseUrlMeta } from './src/parse-url-meta';

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h — binary favicon/og cache
const MAX_FETCH_BYTES = 1_000_000; // 1MB cap
const FETCH_TIMEOUT_MS = 10_000;
const FAVICON_USER_AGENT =
  'OpenPanel-FaviconProxy/1.0 (+https://openpanel.dev)';
const CACHED_ASSET_CACHE_CONTROL = 'public, max-age=604800, immutable'; // 7d
const FRESH_ASSET_CACHE_CONTROL = 'public, max-age=3600, immutable'; // 1h
const STATS_CACHE_TTL_SECONDS = 60 * 60;
const STATS_CACHE_KEY = 'api:stats';
const IMAGE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'];

export interface ImageAssetOk {
  status: 200;
  buffer: Buffer;
  headers: Record<string, string>;
}
export interface ImageAssetFailure {
  status: 400 | 404;
  body: string;
  headers: Record<string, string>;
}
export type ImageAssetResult = ImageAssetOk | ImageAssetFailure;

function createCacheKey(url: string, prefix = 'favicon'): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  // v3: entries written before the SVG/raw-passthrough fix could hold
  // attacker-controlled bytes with an attacker-chosen content type, so the
  // old namespace is abandoned rather than served from.
  return `${prefix}:v3:${hash}`;
}

/**
 * Shape check only. The destination is validated by `assertPublicUrl` /
 * `safeFetch` right before each outbound request, because a hostname can
 * resolve differently between validation and connection.
 */
function validateUrl(raw?: string): URL | null {
  try {
    if (!raw) {
      throw new Error('Missing ?url');
    }
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http/https URLs are allowed');
    }
    return url;
  } catch {
    return null;
  }
}

// Unlike `loadCache` above, this reaches the redis singleton directly rather
// than through `deps`/`ctx` — a known R6 gap (docs/review/misc.md), left as
// nothing calling these two functions today holds a `deps`/`ctx` to thread.
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

async function fetchImage(
  url: URL,
  logger?: Pick<Logger, 'debug' | 'warn'>
): Promise<{ buffer: Buffer; contentType: string; status: number }> {
  try {
    // `safeFetch` validates and pins every hop, so a redirect cannot be used
    // to reach an internal address after the initial URL checks out.
    const result = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_FETCH_BYTES,
      headers: {
        'user-agent': FAVICON_USER_AGENT,
        accept: 'image/*,*/*;q=0.8',
      },
    });

    if (result.status !== 200) {
      return {
        buffer: Buffer.alloc(0),
        contentType: 'text/plain',
        status: result.status,
      };
    }

    const contentType = normalizeContentType(
      result.headers.get('content-type')
    );
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      logger?.debug(
        { url: url.toString(), contentType },
        'Refusing non-image response'
      );
      return {
        buffer: Buffer.alloc(0),
        contentType: 'text/plain',
        status: 415,
      };
    }

    return { buffer: result.body, contentType, status: 200 };
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      logger?.warn(
        { url: url.toString(), reason: error.message },
        'Blocked image fetch'
      );
    }
    return { buffer: Buffer.alloc(0), contentType: 'text/plain', status: 500 };
  }
}

function isDirectImage(url: URL): boolean {
  return (
    IMAGE_EXTENSIONS.some((ext) => url.pathname.endsWith(`.${ext}`)) ||
    url.toString().includes('googleusercontent.com')
  );
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

function textFailure(status: 400 | 404, body: string): ImageAssetFailure {
  return { status, body, headers: { 'content-type': 'text/plain' } };
}

function blockedOrErrorResult(
  isProduction: boolean,
  error: unknown
): ImageAssetFailure {
  if (error instanceof BlockedUrlError) {
    return {
      ...textFailure(400, 'Bad request'),
      headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
    };
  }
  const message = isProduction
    ? 'Bad request'
    : ((error as Error)?.message ?? 'Error');
  return {
    ...textFailure(400, message),
    headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
  };
}

export async function getFavicon(
  config: CoreConfig,
  rawUrl: string | undefined,
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>
): Promise<ImageAssetResult> {
  const url = validateUrl(rawUrl);
  if (!url) {
    return textFailure(404, 'Not found');
  }

  try {
    // Check the destination before anything else, so a blocked host is not
    // leaked to the DuckDuckGo fallback below either.
    await assertPublicUrl(url);

    const cacheKey = createCacheKey(url.toString());
    const cached = await getFromCacheBinary(cacheKey);
    if (cached) {
      return {
        status: 200,
        buffer: cached.buffer,
        headers: imageHeaders(cached.contentType, CACHED_ASSET_CACHE_CONTROL),
      };
    }

    let imageUrl: URL;
    if (isDirectImage(url)) {
      imageUrl = url;
    } else {
      const meta = await parseUrlMeta(url.toString());
      imageUrl = meta?.favicon
        ? new URL(meta.favicon)
        : new URL(`${url.origin}/favicon.ico`);
    }

    let { buffer, contentType } = await fetchImage(imageUrl, logger);

    // If the direct favicon fetch failed and it's not from DuckDuckGo's
    // service, try DuckDuckGo's favicon service as a fallback
    if (buffer.length === 0 && !imageUrl.hostname.includes('duckduckgo.com')) {
      const duckduckgoUrl = new URL(
        `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`
      );
      const duckduckgoResult = await fetchImage(duckduckgoUrl, logger);
      buffer = duckduckgoResult.buffer;
      contentType = duckduckgoResult.contentType;
      imageUrl = duckduckgoUrl;
    }

    if (buffer.length === 0) {
      return textFailure(404, 'Not found');
    }

    // Process the image (resize to 30x30 PNG, or serve ICO as-is)
    const processedBuffer = await processImage(
      buffer,
      imageUrl.toString(),
      contentType,
      logger
    );

    // `processImage` either passed an ICO through untouched or rasterized to
    // PNG, so the response type is derived from what we produced rather than
    // from whatever the upstream server claimed.
    const responseContentType =
      processedBuffer === buffer ? 'image/x-icon' : 'image/png';

    await setToCacheBinary(cacheKey, processedBuffer, responseContentType);

    return {
      status: 200,
      buffer: processedBuffer,
      headers: imageHeaders(responseContentType, FRESH_ASSET_CACHE_CONTROL),
    };
  } catch (error) {
    logger?.error?.({ err: error, url: rawUrl }, 'Favicon fetch error');
    return blockedOrErrorResult(config.isProduction, error);
  }
}

export async function getOgImage(
  config: CoreConfig,
  rawUrl: string | undefined,
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>
): Promise<ImageAssetResult> {
  const url = validateUrl(rawUrl);
  if (!url) {
    return getFavicon(config, rawUrl, logger);
  }

  try {
    await assertPublicUrl(url);

    const cacheKey = createCacheKey(url.toString(), 'og');
    const cached = await getFromCacheBinary(cacheKey);
    if (cached) {
      return {
        status: 200,
        buffer: cached.buffer,
        headers: imageHeaders(cached.contentType, CACHED_ASSET_CACHE_CONTROL),
      };
    }

    let imageUrl: URL;
    if (isDirectImage(url)) {
      imageUrl = url;
    } else {
      const meta = await parseUrlMeta(url.toString());
      if (!meta?.ogImage) {
        return getFavicon(config, rawUrl, logger);
      }
      imageUrl = new URL(meta.ogImage);
    }

    const { buffer, status } = await fetchImage(imageUrl, logger);
    if (status !== 200 || buffer.length === 0) {
      return getFavicon(config, rawUrl, logger);
    }

    // Rasterize to a 300px-wide PNG
    const processedBuffer = await processOgImage(
      buffer,
      imageUrl.toString(),
      logger
    );
    await setToCacheBinary(cacheKey, processedBuffer, 'image/png');

    return {
      status: 200,
      buffer: processedBuffer,
      headers: imageHeaders('image/png', FRESH_ASSET_CACHE_CONTROL),
    };
  } catch (error) {
    logger?.error?.({ err: error, url: rawUrl }, 'OG image fetch error');
    return blockedOrErrorResult(config.isProduction, error);
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
 * reporting its event count back to `api.openpanel.dev/misc/ping` (the H
 * route above, on OUR side). Ported verbatim from
 * apps/worker/src/jobs/cron.ping.ts.
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
