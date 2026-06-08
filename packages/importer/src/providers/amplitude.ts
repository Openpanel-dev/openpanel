import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createBrotliDecompress, createGunzip } from 'node:zlib';
import { isSameDomain, parsePath, toDots } from '@openpanel/common';
import {
  getReferrerWithQuery,
  parseReferrer,
} from '@openpanel/common/server';
import { formatClickhouseDate, type IClickhouseEvent } from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { IAmplitudeImportConfig } from '@openpanel/validation';
import { z } from 'zod';
import { BaseImportProvider } from '../base-provider';
import { toCountryCode } from './country-codes';

/**
 * Amplitude / Segment export rows are newline-delimited JSON. Each line is a
 * flat object with top-level metadata and nested `event_properties` /
 * `user_properties`. We only validate the fields we consume; everything else
 * is passed through untouched.
 */
export const zAmplitudeRawEvent = z.object({
  event_type: z.string().min(1),
  event_properties: z.record(z.string(), z.unknown()).optional().default({}),
  user_properties: z.record(z.string(), z.unknown()).optional().default({}),
  // Identity
  device_id: z.string().optional().nullable(),
  user_id: z.string().optional().nullable(),
  amplitude_id: z.union([z.string(), z.number()]).optional().nullable(),
  // Timestamps (UTC, "YYYY-MM-DD HH:mm:ss.SSSSSS")
  event_time: z.string().optional().nullable(),
  client_event_time: z.string().optional().nullable(),
  // Geo
  country: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  // Device / platform
  platform: z.string().optional().nullable(),
  os_name: z.string().optional().nullable(),
  os_version: z.string().optional().nullable(),
  device_brand: z.string().optional().nullable(),
  device_manufacturer: z.string().optional().nullable(),
  device_model: z.string().optional().nullable(),
  device_family: z.string().optional().nullable(),
  device_type: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  version_name: z.string().optional().nullable(),
  // Source
  library: z.string().optional().nullable(),
  $insert_id: z.string().optional().nullable(),
  uuid: z.string().optional().nullable(),
});
export type AmplitudeRawEvent = z.infer<typeof zAmplitudeRawEvent>;

const URL_LIKE_KEYS = ['url', '$current_url', 'current_url', 'page_url'];

export class AmplitudeProvider extends BaseImportProvider<AmplitudeRawEvent> {
  provider = 'amplitude';
  version = '1.0.0';

  constructor(
    private readonly projectId: string,
    private readonly config: IAmplitudeImportConfig,
    private readonly logger?: ILogger
  ) {
    super();
  }

  async getTotalEventsCount(): Promise<number> {
    return -1;
  }

  /**
   * Amplitude exports carry no usable session IDs (Segment-forwarded events
   * report session_id = -1). Generate gap-based sessions in SQL after load,
   * the same way the Mixpanel importer does.
   */
  shouldGenerateSessionIds(): boolean {
    return true;
  }

  async *parseSource(): AsyncGenerator<AmplitudeRawEvent, void, unknown> {
    yield* this.parseRemoteFile(this.config.fileUrl);
  }

  /**
   * Stream a remote newline-delimited JSON file.
   *
   * Note: we do NOT inspect the Content-Encoding/Content-Type headers to decide
   * whether to decompress. fetch/undici already transparently decompresses
   * transport-level gzip/br (e.g. a dev server that gzips responses on the fly),
   * yet leaves the Content-Encoding header in place. Trusting it would gunzip
   * already-plain JSON and throw "incorrect header check". Instead we detect a
   * genuinely-gzipped file by its magic bytes (see streamNdjson).
   */
  private async *parseRemoteFile(
    url: string
  ): AsyncGenerator<AmplitudeRawEvent, void, unknown> {
    const controller = new AbortController();
    const res = await fetch(url, { signal: controller.signal });
    if (!(res.ok && res.body)) {
      throw new Error(
        `Failed to fetch remote file: ${res.status} ${res.statusText}`
      );
    }

    const body = Readable.fromWeb(res.body as any);
    try {
      yield* this.streamNdjson(body, url);
    } finally {
      controller.abort(); // tear down the fetch stream
    }
  }

  /**
   * Decode a binary stream of newline-delimited JSON into parsed events.
   * Detects gzip by peeking the first chunk's magic bytes (0x1f 0x8b) rather
   * than trusting response headers; brotli is only applied for explicit `.br`
   * URLs since the stream may already be transport-decompressed.
   */
  async *streamNdjson(
    input: Readable,
    url: string
  ): AsyncGenerator<AmplitudeRawEvent, void, unknown> {
    const iterator = input[Symbol.asyncIterator]();
    const first = await iterator.next();
    const firstChunk = first.done ? undefined : (first.value as Buffer);

    const isGzip =
      !!firstChunk &&
      firstChunk.length >= 2 &&
      firstChunk[0] === 0x1f &&
      firstChunk[1] === 0x8b;
    const isBrotli = !isGzip && /\.br($|\?)/i.test(url);

    async function* sourceChunks() {
      if (firstChunk !== undefined) {
        yield firstChunk;
      }
      for (
        let next = await iterator.next();
        !next.done;
        next = await iterator.next()
      ) {
        yield next.value;
      }
    }

    const source = Readable.from(sourceChunks());
    const stream = isGzip
      ? source.pipe(createGunzip())
      : isBrotli
        ? source.pipe(createBrotliDecompress())
        : source;

    const rl = createInterface({
      input: stream,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          yield JSON.parse(trimmed) as AmplitudeRawEvent;
        } catch (error) {
          this.logger?.warn(
            { err: error, line: trimmed.substring(0, 100) },
            'Failed to parse Amplitude event'
          );
        }
      }
    } finally {
      rl.close();
    }
  }

  validate(rawEvent: AmplitudeRawEvent): boolean {
    return zAmplitudeRawEvent.safeParse(rawEvent).success;
  }

  transformEvent(_rawEvent: AmplitudeRawEvent): IClickhouseEvent {
    const raw = zAmplitudeRawEvent.parse(_rawEvent);
    const props = raw.event_properties as Record<string, unknown>;

    const deviceId = raw.device_id || String(raw.amplitude_id ?? '');
    const profileId = raw.user_id || deviceId;

    // Web URL handling (rare for mobile exports, but supported for web shards)
    const rawUrl = URL_LIKE_KEYS.map((key) => props[key]).find(
      (value): value is string => typeof value === 'string' && value.length > 0
    );
    let path = '';
    let origin = '';
    let hash = '';
    let query: Record<string, string> = {};
    if (rawUrl) {
      const parsed = parsePath(rawUrl);
      path = parsed.path || '';
      origin = parsed.origin || '';
      hash = parsed.hash || '';
      query = parsed.query || {};
    } else if (this.config.mapScreenViewProperty) {
      path = String(props[this.config.mapScreenViewProperty] ?? '');
    }

    // Referrer (web only)
    const referrerUrl = String(props.referrer || props.$referrer || '');
    const referrer =
      referrerUrl && !isSameDomain(referrerUrl, rawUrl || '')
        ? parseReferrer(referrerUrl)
        : null;
    const utmReferrer = getReferrerWithQuery(query);

    const properties = this.buildProperties(props, query);
    const insertId = raw.$insert_id || raw.uuid;
    if (insertId) {
      properties.__source_insert_id = insertId;
    }
    if (raw.language) {
      properties.__language = raw.language;
    }
    if (raw.version_name) {
      properties.__version = raw.version_name;
    }
    if (hash) {
      properties.__hash = hash;
    }
    if (Object.keys(query).length > 0) {
      properties.__query = query;
    }

    const eventName = this.mapEventName(raw.event_type);
    const timestamp = this.parseTimestamp(raw.event_time || raw.client_event_time);

    return {
      id: randomUUID(),
      name: eventName,
      device_id: deviceId,
      profile_id: profileId,
      project_id: this.projectId,
      session_id: '', // Generated in SQL after import
      properties: toDots(properties),
      created_at: formatClickhouseDate(timestamp),
      country: toCountryCode(raw.country),
      city: raw.city || '',
      region: raw.region || '',
      longitude: raw.location_lng ?? null,
      latitude: raw.location_lat ?? null,
      os: this.mapOs(raw.os_name),
      os_version: raw.os_version || '',
      browser: '',
      browser_version: '',
      device: this.getDeviceType(raw),
      brand: this.getBrand(raw),
      model: raw.device_model || raw.device_type || '',
      duration: 0,
      path,
      origin,
      referrer: referrer?.url || '',
      referrer_name: utmReferrer?.name || referrer?.name || '',
      referrer_type: referrer?.type || utmReferrer?.type || '',
      imported_at: new Date().toISOString(),
      sdk_name: raw.library
        ? `${this.provider} (${raw.library})`
        : this.provider,
      sdk_version: this.version,
      groups: [],
    };
  }

  /**
   * Map Amplitude system event names to OpenPanel conventions. Custom event
   * names pass through unchanged.
   */
  private mapEventName(eventType: string): string {
    if (
      eventType === '[Amplitude] Page Viewed' ||
      eventType === 'Page Viewed' ||
      eventType === 'Screen Viewed'
    ) {
      return 'screen_view';
    }
    return eventType;
  }

  /**
   * Parse Amplitude's "YYYY-MM-DD HH:mm:ss.SSSSSS" UTC timestamps. Trims the
   * microseconds to milliseconds and pins the zone to UTC so we don't fall back
   * to the host's local timezone.
   */
  private parseTimestamp(value?: string | null): Date {
    if (!value) {
      return new Date();
    }
    const normalized = `${value.replace(' ', 'T').replace(/(\.\d{3})\d*$/, '$1')}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? new Date(value) : date;
  }

  private mapOs(osName?: string | null): string {
    const os = (osName || '').toLowerCase();
    const mapping: Record<string, string> = {
      ios: 'iOS',
      android: 'Android',
      'mac os x': 'Mac OS',
      macos: 'Mac OS',
      windows: 'Windows',
      linux: 'Linux',
    };
    return mapping[os] || osName || '';
  }

  private getBrand(raw: AmplitudeRawEvent): string {
    if (raw.device_brand) {
      return raw.device_brand;
    }
    if (raw.device_manufacturer) {
      return raw.device_manufacturer;
    }
    // Derive from device_family (e.g. "Apple iPhone" -> "Apple")
    const family = raw.device_family || raw.device_type || '';
    if (/apple|iphone|ipad|ios/i.test(family)) {
      return 'Apple';
    }
    return '';
  }

  private getDeviceType(raw: AmplitudeRawEvent): string {
    const os = (raw.os_name || '').toLowerCase();
    const platform = (raw.platform || '').toLowerCase();
    const family = `${raw.device_family || ''} ${raw.device_type || ''}`.toLowerCase();

    const isMobileOs =
      os === 'ios' ||
      os === 'android' ||
      platform === 'ios' ||
      platform === 'android';

    if (isMobileOs) {
      return family.includes('ipad') || family.includes('tablet')
        ? 'tablet'
        : 'mobile';
    }

    if (platform === 'web' || /chrome|safari|firefox|edge/.test(os)) {
      return 'desktop';
    }

    // Unknown platform: Amplitude exports are overwhelmingly mobile, but a
    // present platform that isn't web is a stronger mobile signal than not.
    return platform ? 'mobile' : 'desktop';
  }

  /**
   * Build the OpenPanel properties bag from Amplitude event_properties: drop
   * keys already represented elsewhere (URLs, query params) and parse
   * stringified JSON so toDots() can flatten nested structures.
   */
  private buildProperties(
    props: Record<string, unknown>,
    query: Record<string, string>
  ): Record<string, any> {
    const strip = new Set([...URL_LIKE_KEYS, 'referrer', '$referrer', ...Object.keys(query)]);
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(props)) {
      if (strip.has(key) || value == null) {
        continue;
      }
      if (
        typeof value === 'string' &&
        (value.startsWith('{') || value.startsWith('['))
      ) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
