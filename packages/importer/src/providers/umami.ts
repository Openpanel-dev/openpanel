import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip } from 'node:zlib';
import { isSameDomain, parsePath } from '@openpanel/common';
import { generateDeviceId } from '@openpanel/common/server';
import { getReferrerWithQuery, parseReferrer } from '@openpanel/common/server';
import type { IClickhouseEvent } from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { IUmamiImportConfig } from '@openpanel/validation';
import { parse } from 'csv-parse';
import { assocPath } from 'ramda';
import { z } from 'zod';
import { BaseImportProvider } from '../base-provider';

export const zUmamiRawEvent = z.object({
  // Required fields
  event_type: z.coerce.number(),
  event_name: z.string(),
  created_at: z.coerce.date(),
  event_id: z.string().min(1),
  session_id: z.string().min(1),
  website_id: z.string().min(1),

  // Optional fields that might be empty
  visit_id: z.string().optional(),
  distinct_id: z.string().optional(),
  url_path: z.string().optional(),
  hostname: z.string().optional(),
  referrer_domain: z.string().optional(),
  referrer_path: z.string().optional(),
  referrer_query: z.string().optional(),
  referrer_name: z.string().optional(),
  referrer_type: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  device: z.string().optional(),
  screen: z.string().optional(),
  language: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  page_title: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  msclkid: z.string().optional(),
  ttclid: z.string().optional(),
  li_fat_id: z.string().optional(),
  twclid: z.string().optional(),
  url_query: z.string().optional(),
});
export type UmamiRawEvent = z.infer<typeof zUmamiRawEvent>;

export class UmamiProvider extends BaseImportProvider<UmamiRawEvent> {
  provider = 'umami';
  version = '1.0.0';

  constructor(
    private readonly projectId: string,
    private readonly config: IUmamiImportConfig,
    private readonly logger?: ILogger,
  ) {
    super();
  }

  async getTotalEventsCount(): Promise<number> {
    return -1;
  }

  async *parseSource(): AsyncGenerator<UmamiRawEvent, void, unknown> {
    yield* this.parseRemoteFile(this.config.fileUrl);
  }

  private async *parseRemoteFile(
    url: string,
    opts: {
      signal?: AbortSignal;
      maxBytes?: number;
      maxRows?: number;
    } = {},
  ): AsyncGenerator<UmamiRawEvent, void, unknown> {
    const { signal, maxBytes, maxRows } = opts;
    const controller = new AbortController();

    // Link to caller's signal for cancellation
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error(
        `Failed to fetch remote file: ${res.status} ${res.statusText}`,
      );
    }

    const contentType = res.headers.get('content-type') || '';
    const contentEnc = res.headers.get('content-encoding') || '';
    const contentLen = Number(res.headers.get('content-length') ?? 0);

    if (
      contentType &&
      !/text\/csv|text\/plain|application\/gzip|application\/octet-stream/i.test(
        contentType,
      )
    ) {
      console.warn(`Warning: Content-Type is ${contentType}, expected CSV-ish`);
    }

    if (maxBytes && contentLen && contentLen > maxBytes) {
      throw new Error(
        `Remote file exceeds size limit (${contentLen} > ${maxBytes})`,
      );
    }

    const looksGzip =
      /\.gz($|\?)/i.test(url) ||
      /gzip/i.test(contentEnc) ||
      /application\/gzip/i.test(contentType);
    const looksBr = /br/i.test(contentEnc) || /\.br($|\?)/i.test(url);

    // WHATWG -> Node stream
    const body = Readable.fromWeb(res.body as any);

    // Optional size guard during stream
    let seenBytes = 0;
    if (maxBytes) {
      body.on('data', (chunk: Buffer) => {
        seenBytes += chunk.length;
        if (seenBytes > maxBytes) {
          controller.abort();
          body.destroy(
            new Error(
              `Stream exceeded size limit (${seenBytes} > ${maxBytes})`,
            ),
          );
        }
      });
    }

    // Build decode chain (gzip/brotli -> CSV parser)
    const decompress = looksGzip
      ? createGunzip()
      : looksBr
        ? createBrotliDecompress()
        : null;

    const parser = parse({
      columns: true, // objects per row
      bom: true, // handle UTF-8 BOM
      relax_column_count: true,
      skip_empty_lines: true,
    });

    // Wire the pipeline for proper backpressure & error propagation
    (async () => {
      try {
        if (decompress) {
          await pipeline(body, decompress, parser, {
            signal: controller.signal,
          });
        } else {
          await pipeline(body, parser, { signal: controller.signal });
        }
      } catch (e) {
        parser.destroy(e as Error);
      }
    })().catch(() => {
      /* handled by iterator */
    });

    let rows = 0;
    try {
      for await (const record of parser) {
        rows++;
        if (maxRows && rows > maxRows) {
          controller.abort();
          throw new Error(`Row limit exceeded (${rows} > ${maxRows})`);
        }
        yield record as UmamiRawEvent;
      }
    } catch (err) {
      throw new Error(
        `Failed to parse remote file from ${url}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      controller.abort(); // ensure fetch stream is torn down
    }
  }

  validate(rawEvent: UmamiRawEvent): boolean {
    const res = zUmamiRawEvent.safeParse(rawEvent);
    return res.success;
  }

  transformEvent(_rawEvent: UmamiRawEvent): IClickhouseEvent {
    const projectId =
      this.config.projectMapper.find(
        (mapper) => mapper.from === _rawEvent.website_id,
      )?.to || this.projectId;

    const rawEvent = zUmamiRawEvent.parse(_rawEvent);
    // Extract device/profile ID - use visit_id as device_id, session_id for session tracking
    const deviceId =
      rawEvent.visit_id ||
      generateDeviceId({
        ip: rawEvent.visit_id!,
        ua: rawEvent.visit_id!,
        origin: projectId,
        salt: 'xxx',
      });
    const profileId = rawEvent.distinct_id || deviceId;

    // Parse URL if available - use same logic as real-time events
    const url = rawEvent.url_path
      ? `https://${[rawEvent.hostname, rawEvent.url_path, rawEvent.url_query]
          .filter(Boolean)
          .join('')}`
      : '';
    const { path, hash, query, origin } = parsePath(url);
    // Extract referrer information - use same logic as real-time events
    const referrerUrl = rawEvent.referrer_domain
      ? `https://${rawEvent.referrer_domain}${rawEvent.referrer_path || ''}`
      : '';

    // Check if referrer is from same domain (like real-time events do)
    const referrer = isSameDomain(referrerUrl, url)
      ? null
      : parseReferrer(referrerUrl);

    // Check for UTM referrer in query params (like real-time events do)
    const utmReferrer = getReferrerWithQuery(query);

    // Extract location data
    const country = rawEvent.country || '';
    const city = rawEvent.city || '';
    const region = rawEvent.region || '';

    // Extract browser/device info
    const browser = rawEvent.browser || '';
    const browserVersion = ''; // Not available in Umami CSV
    const os = rawEvent.os || '';
    const osVersion = ''; // Not available in Umami CSV
    const device = rawEvent.device || '';
    const brand = ''; // Not available in Umami CSV
    const model = ''; // Not available in Umami CSV

    let properties: Record<string, any> = {};

    if (query) {
      properties.__query = query;
    }

    // Add useful properties from Umami data
    if (rawEvent.page_title) properties.__title = rawEvent.page_title;
    if (rawEvent.screen) properties.__screen = rawEvent.screen;
    if (rawEvent.language) properties.__language = rawEvent.language;
    if (rawEvent.utm_source)
      properties = assocPath(
        ['__query', 'utm_source'],
        rawEvent.utm_source,
        properties,
      );
    if (rawEvent.utm_medium)
      properties = assocPath(
        ['__query', 'utm_medium'],
        rawEvent.utm_medium,
        properties,
      );
    if (rawEvent.utm_campaign)
      properties = assocPath(
        ['__query', 'utm_campaign'],
        rawEvent.utm_campaign,
        properties,
      );
    if (rawEvent.utm_content)
      properties = assocPath(
        ['__query', 'utm_content'],
        rawEvent.utm_content,
        properties,
      );
    if (rawEvent.utm_term)
      properties = assocPath(
        ['__query', 'utm_term'],
        rawEvent.utm_term,
        properties,
      );

    return {
      id: rawEvent.event_id || randomUUID(),
      name: rawEvent.event_type === 1 ? 'screen_view' : rawEvent.event_name,
      device_id: deviceId,
      profile_id: profileId,
      project_id: projectId,
      session_id: rawEvent.session_id || '',
      properties,
      created_at: rawEvent.created_at.toISOString(),
      country,
      city,
      region: this.mapRegion(region),
      longitude: null,
      latitude: null,
      os,
      os_version: osVersion,
      browser: this.mapBrowser(browser),
      browser_version: browserVersion,
      device: this.mapDevice(device),
      brand,
      model,
      duration: 0,
      path,
      origin,
      referrer: utmReferrer?.url || referrer?.url || '',
      referrer_name: utmReferrer?.name || referrer?.name || '',
      referrer_type: utmReferrer?.type || referrer?.type || '',
      imported_at: new Date().toISOString(),
      sdk_name: this.provider,
      sdk_version: this.version,
    };
  }

  mapRegion(region: string): string {
    return region.replace(/^[A-Z]{2}\-/, '');
  }

  mapDevice(device: string): string {
    const mapping: Record<string, string> = {
      desktop: 'desktop',
      laptop: 'desktop',
      mobile: 'mobile',
      tablet: 'tablet',
      smarttv: 'smarttv',
      Unknown: 'desktop',
    };

    return mapping[device] || 'desktop';
  }

  mapBrowser(browser: string): string {
    const mapping: Record<string, string> = {
      android: 'Android',
      aol: 'AOL',
      bb10: 'BlackBerry 10',
      beaker: 'Beaker',
      chrome: 'Chrome',
      'chromium-webview': 'Chrome (webview)',
      crios: 'Chrome (iOS)',
      curl: 'Curl',
      edge: 'Edge',
      'edge-chromium': 'Edge (Chromium)',
      'edge-ios': 'Edge (iOS)',
      facebook: 'Facebook',
      firefox: 'Firefox',
      fxios: 'Firefox (iOS)',
      ie: 'IE',
      instagram: 'Instagram',
      ios: 'iOS',
      'ios-webview': 'iOS (webview)',
      kakaotalk: 'KakaoTalk',
      miui: 'MIUI',
      opera: 'Opera',
      'opera-mini': 'Opera Mini',
      phantomjs: 'PhantomJS',
      safari: 'Safari',
      samsung: 'Samsung',
      searchbot: 'Searchbot',
      silk: 'Silk',
      yandexbrowser: 'Yandex',
    };

    return mapping[browser] || browser || 'Unknown';
  }
}
