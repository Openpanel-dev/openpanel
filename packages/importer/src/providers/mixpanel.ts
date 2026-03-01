import { randomUUID } from 'node:crypto';
import { isSameDomain, parsePath, toDots } from '@openpanel/common';
import {
  getReferrerWithQuery,
  parseReferrer,
  parseUserAgent,
  type UserAgentInfo,
} from '@openpanel/common/server';
import { formatClickhouseDate, type IClickhouseEvent } from '@openpanel/db';
import type { IClickhouseProfile } from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { IMixpanelImportConfig } from '@openpanel/validation';
import { z } from 'zod';
import { BaseImportProvider } from '../base-provider';

export const zMixpanelRawEvent = z.object({
  event: z.string(),
  properties: z.record(z.unknown()),
});

export type MixpanelRawEvent = z.infer<typeof zMixpanelRawEvent>;

/** Engage API profile: https://docs.mixpanel.com/docs/export-methods#exporting-profiles */
export const zMixpanelRawProfile = z.object({
  $distinct_id: z.union([z.string(), z.number()]),
  $properties: z.record(z.unknown()).optional().default({}),
});
export type MixpanelRawProfile = z.infer<typeof zMixpanelRawProfile>;

class MixpanelRateLimitError extends Error {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'MixpanelRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class MixpanelProvider extends BaseImportProvider<MixpanelRawEvent> {
  provider = 'mixpanel';
  version = '1.0.0';

  private static readonly MAX_REQUESTS_PER_HOUR = 100;
  private static readonly MIN_REQUEST_INTERVAL_MS = 334; // 3 QPS limit
  private requestTimestamps: number[] = [];
  private lastRequestTime = 0;

  constructor(
    private readonly projectId: string,
    private readonly config: IMixpanelImportConfig,
    private readonly logger?: ILogger
  ) {
    super();
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Prune timestamps older than 1 hour
    this.requestTimestamps = this.requestTimestamps.filter(
      (t) => t > oneHourAgo
    );

    // Enforce per-second limit (3 QPS → min 334ms gap)
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < MixpanelProvider.MIN_REQUEST_INTERVAL_MS) {
      const delay = MixpanelProvider.MIN_REQUEST_INTERVAL_MS - timeSinceLast;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Enforce hourly limit
    if (
      this.requestTimestamps.length >= MixpanelProvider.MAX_REQUESTS_PER_HOUR
    ) {
      const oldestInWindow = this.requestTimestamps[0]!;
      const waitUntil = oldestInWindow + 60 * 60 * 1000;
      const waitMs = waitUntil - Date.now() + 1000; // +1s buffer

      if (waitMs > 0) {
        this.logger?.info(
          `Rate limit: ${this.requestTimestamps.length} requests in the last hour, waiting ${Math.ceil(waitMs / 1000)}s`,
          {
            requestsInWindow: this.requestTimestamps.length,
            waitMs,
          }
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        // Prune again after waiting
        this.requestTimestamps = this.requestTimestamps.filter(
          (t) => t > Date.now() - 60 * 60 * 1000
        );
      }
    }

    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(Date.now());
  }

  getTotalEventsCount(): Promise<number> {
    // Mixpanel sucks and dont provide a good way to extract total event count within a period
    // jql would work but not accurate and will be deprecated end of 2025
    return Promise.resolve(-1);
  }

  /**
   * Mixpanel doesn't provide session IDs, so we need to generate them in SQL
   * after all events are imported to ensure deterministic results
   */
  shouldGenerateSessionIds(): boolean {
    return true;
  }

  async *parseSource(
    overrideFrom?: string
  ): AsyncGenerator<MixpanelRawEvent, void, unknown> {
    yield* this.fetchEventsFromMixpanel(overrideFrom);
  }

  private async *fetchEventsFromMixpanel(
    overrideFrom?: string
  ): AsyncGenerator<MixpanelRawEvent, void, unknown> {
    const { serviceAccount, serviceSecret, projectId, from, to } = this.config;

    // Split the date range into daily chunks for reliability
    // Uses base class utility to avoid timeout issues with large date ranges
    const dateChunks = this.getDateChunks(overrideFrom ?? from, to); // 1 day per chunk (default)

    for (const [chunkFrom, chunkTo] of dateChunks) {
      let retries = 0;
      const maxRetries = 6;

      while (retries <= maxRetries) {
        try {
          await this.waitForRateLimit();
          yield* this.fetchEventsForDateRange(
            serviceAccount,
            serviceSecret,
            projectId,
            chunkFrom,
            chunkTo
          );
          break; // Success, move to next chunk
        } catch (error) {
          retries++;
          const isRateLimit =
            error instanceof MixpanelRateLimitError ||
            (error instanceof Error && error.message.includes('429'));
          const isLastRetry = retries > maxRetries;

          this.logger?.warn('Failed to fetch events for date range', {
            chunkFrom,
            chunkTo,
            attempt: retries,
            maxRetries,
            error: (error as Error).message,
            isRateLimit,
            willRetry: !isLastRetry,
          });

          if (isLastRetry) {
            throw new Error(
              `Failed to fetch Mixpanel events for ${chunkFrom} to ${chunkTo} after ${maxRetries} retries: ${(error as Error).message}`
            );
          }

          let delay: number;
          if (error instanceof MixpanelRateLimitError && error.retryAfterMs) {
            delay = error.retryAfterMs;
          } else if (isRateLimit) {
            // 5min → 10min → 15min → 15min → 15min = 60min total
            delay = Math.min(300_000 * 2 ** (retries - 1), 900_000);
          } else {
            delay = Math.min(1000 * 2 ** (retries - 1), 60_000);
          }

          this.logger?.info('Retrying after delay', {
            delayMs: delay,
            chunkFrom,
            chunkTo,
            isRateLimit,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  private async *fetchEventsForDateRange(
    serviceAccount: string,
    serviceSecret: string,
    projectId: string,
    from: string,
    to: string
  ): AsyncGenerator<MixpanelRawEvent, void, unknown> {
    const url = 'https://data.mixpanel.com/api/2.0/export';

    const params = new URLSearchParams({
      from_date: from,
      to_date: to,
      project_id: projectId,
    });

    this.logger?.info('Fetching events from Mixpanel', {
      url: `${url}?${params}`,
      from,
      to,
      projectId,
      serviceAccount,
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${serviceAccount}:${serviceSecret}`).toString('base64')}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
      throw new MixpanelRateLimitError(
        'Mixpanel rate limit exceeded (429)',
        retryAfterMs
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch events from Mixpanel: ${response.status} ${response.statusText}`
      );
    }

    if (!response.body) {
      throw new Error('No response body from Mixpanel API');
    }

    // Stream the response line by line
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              yield event;
            } catch (error) {
              this.logger?.warn('Failed to parse Mixpanel event', {
                line: line.substring(0, 100),
                error,
              });
            }
          }
        }
      }

      // Process any remaining line in buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          yield event;
        } catch (error) {
          this.logger?.warn(
            'Failed to parse Mixpanel event (remaining buffer)',
            {
              line: buffer.substring(0, 100),
              error,
            }
          );
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Stream user profiles from Mixpanel Engage API.
   * Paginates with page/page_size (5k per page) and yields each profile.
   */
  async *streamProfiles(): AsyncGenerator<MixpanelRawProfile, void, unknown> {
    const { serviceAccount, serviceSecret, projectId } = this.config;
    const pageSize = 5000;
    let page = 0;

    while (true) {
      await this.waitForRateLimit();

      const url = `https://mixpanel.com/api/query/engage?project_id=${encodeURIComponent(projectId)}`;
      const body = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });

      this.logger?.info('Fetching profiles from Mixpanel Engage', {
        page,
        page_size: pageSize,
        projectId,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${serviceAccount}:${serviceSecret}`).toString('base64')}`,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
        throw new MixpanelRateLimitError(
          'Mixpanel rate limit exceeded (429)',
          retryAfterMs
        );
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Failed to fetch profiles from Mixpanel: ${response.status} ${response.statusText} - ${text}`
        );
      }

      const data = (await response.json()) as {
        results?: Array<{ $distinct_id: string | number; $properties?: Record<string, unknown> }>;
        page?: number;
        total?: number;
      };

      const results = data.results ?? [];
      for (const row of results) {
        const parsed = zMixpanelRawProfile.safeParse(row);
        if (parsed.success) {
          yield parsed.data;
        } else {
          this.logger?.warn('Skipping invalid Mixpanel profile', {
            row: JSON.stringify(row).slice(0, 200),
          });
        }
      }

      if (results.length < pageSize) {
        break;
      }
      page++;
    }
  }

  /**
   * Map Mixpanel Engage profile to OpenPanel IClickhouseProfile.
   */
  transformProfile(raw: MixpanelRawProfile): IClickhouseProfile {
    const parsed = zMixpanelRawProfile.parse(raw);
    const props = (parsed.$properties || {}) as Record<string, unknown>;

    const id = String(parsed.$distinct_id).replace(/^\$device:/, '');
    const createdAt = props.$created
      ? formatClickhouseDate(new Date(String(props.$created)))
      : formatClickhouseDate(new Date());

    const properties: Record<string, string> = {};
    const stripPrefix = /^\$/;
    for (const [key, value] of Object.entries(props)) {
      if (stripPrefix.test(key)) continue;
      if (value == null) continue;
      properties[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    return {
      id,
      project_id: this.projectId,
      first_name: String(props.$first_name ?? ''),
      last_name: String(props.$last_name ?? ''),
      email: String(props.$email ?? ''),
      avatar: String(props.$avatar ?? props.$image ?? ''),
      properties,
      created_at: createdAt,
      is_external: true,
    };
  }

  validate(rawEvent: MixpanelRawEvent): boolean {
    const res = zMixpanelRawEvent.safeParse(rawEvent);
    return res.success;
  }

  transformEvent(_rawEvent: MixpanelRawEvent): IClickhouseEvent {
    const projectId = this.projectId;
    const rawEvent = zMixpanelRawEvent.parse(_rawEvent);
    const props = rawEvent.properties as Record<string, any>;
    const deviceId = props.$device_id;
    const profileId = String(props.$user_id || props.distinct_id).replace(
      /^\$device:/,
      ''
    );

    // Build full URL from current_url and current_url_search (web only)
    const fullUrl = props.$current_url;
    let path = '';
    let origin = '';
    let hash = '';
    let query: Record<string, string> = {};

    if (fullUrl) {
      const parsed = parsePath(fullUrl);
      path = parsed.path || '';
      origin = parsed.origin || '';
      hash = parsed.hash || '';
      query = parsed.query || {};
    } else if (this.config.mapScreenViewProperty) {
      path = props[this.config.mapScreenViewProperty] || '';
    }

    // Extract referrer information (web only)
    const referrerUrl = props.$initial_referrer || props.$referrer || '';
    const referrer =
      referrerUrl && !isSameDomain(referrerUrl, fullUrl)
        ? parseReferrer(referrerUrl)
        : null;

    // Check for UTM referrer in query params (web only)
    const utmReferrer = getReferrerWithQuery(query);

    // Extract location data
    const country = props.$country || props.mp_country_code || '';
    const city = props.$city || '';
    const region = props.$region || '';

    // For web events, use the standard user agent parsing
    const userAgent = props.osVersion || '';
    const uaInfo = this.isWebEvent(props.mp_lib)
      ? parseUserAgent(userAgent, props)
      : this.parseServerDeviceInfo(props);

    // Map event name - $mp_web_page_view should be screen_view
    let eventName = rawEvent.event;
    if (eventName === '$mp_web_page_view') {
      eventName = 'screen_view';
    }

    // Build properties object - strip Mixpanel-specific properties
    const properties = this.stripMixpanelProperties(props, query);

    if (props.$insert_id) {
      properties.__source_insert_id = String(props.$insert_id);
    }
    // Add useful properties
    if (props.$screen_width && props.$screen_height) {
      properties.__screen = `${props.$screen_width}x${props.$screen_height}`;
    }
    if (props.$screen_dpi) {
      properties.__dpi = props.$screen_dpi;
    }
    if (props.$language) {
      properties.__language = props.$language;
    }
    if (props.$timezone) {
      properties.__timezone = props.$timezone;
    }
    if (props.$app_version) {
      properties.__version = props.$app_version;
    }
    if (props.$app_build_number) {
      properties.__buildNumber = props.$app_build_number;
    }
    if (props.$lib_version) {
      properties.__lib_version = props.$lib_version;
    }

    if (hash) {
      properties.__hash = hash;
    }

    if (Object.keys(query).length > 0) {
      properties.__query = query;
    }

    if (props.current_page_title) {
      properties.__title = props.current_page_title;
    }

    if (userAgent) {
      properties.__userAgent = userAgent;
    }

    // Always use UUID for id to match ClickHouse UUID column
    const event = {
      id: randomUUID(),
      name: eventName,
      device_id: deviceId,
      profile_id: profileId,
      project_id: projectId,
      session_id: '', // Will be generated in SQL after import
      properties: toDots(properties), // Flatten nested objects/arrays to Map(String, String)
      created_at: formatClickhouseDate(new Date(props.time * 1000)),
      country,
      city,
      region,
      longitude: null,
      latitude: null,
      os: uaInfo.os || props.$os,
      os_version: uaInfo.osVersion || props.$osVersion,
      browser: uaInfo.browser || props.$browser,
      browser_version: uaInfo.browserVersion || String(props.$browser_version ?? ''),
      device: this.getDeviceType(props.mp_lib, uaInfo, props),
      brand: uaInfo.brand || '',
      model: uaInfo.model || '',
      duration: 0,
      path,
      origin,
      referrer: referrer?.url || '',
      referrer_name: utmReferrer?.name || referrer?.name || '',
      referrer_type: referrer?.type || utmReferrer?.type || '',
      imported_at: new Date().toISOString(),
      sdk_name: props.mp_lib
        ? `${this.provider} (${props.mp_lib})`
        : this.provider,
      sdk_version: this.version,
    };

    // TODO: Remove this
    // This is a hack to get utm tags (not sure if this is just the testing project or all mixpanel projects)
    if (props.utm_source && !properties.__query?.utm_source) {
      const split = decodeURIComponent(props.utm_source).split('&');
      const query = Object.fromEntries(split.map((item) => item.split('=')));
      for (const [key, value] of Object.entries(query)) {
        if (key && value) {
          event.properties[`__query.${key}`] = String(value);
        } else if (
          value === undefined &&
          key &&
          props.utm_source &&
          String(props.utm_source).startsWith(key)
        ) {
          event.properties['__query.utm_source'] = String(key);
        }
      }
    }

    return event;
  }

  private getDeviceType(
    mp_lib: string,
    uaInfo: UserAgentInfo,
    props: Record<string, any>
  ) {
    // Normalize lib/os/browser data
    const lib = (mp_lib || '').toLowerCase();
    const os = String(props.$os || uaInfo.os || '').toLowerCase();
    const browser = String(
      props.$browser || uaInfo.browser || ''
    ).toLowerCase();

    const isTabletOs = os === 'ipados' || os === 'ipad os' || os === 'ipad';

    // Strong hint from SDK library
    if (['android', 'iphone', 'react-native', 'swift', 'unity'].includes(lib)) {
      return isTabletOs ? 'tablet' : 'mobile';
    }

    // Web or unknown SDKs: infer from OS/Browser
    const isMobileSignal =
      os === 'ios' ||
      os === 'android' ||
      browser.includes('mobile safari') ||
      browser.includes('chrome ios') ||
      browser.includes('android mobile') ||
      browser.includes('samsung internet') ||
      browser.includes('mobile');

    if (isMobileSignal) {
      return 'mobile';
    }

    const isTabletSignal =
      isTabletOs ||
      browser.includes('tablet') ||
      // iPad often reports as Mac OS X with Mobile Safari
      (browser.includes('mobile safari') &&
        (os === 'mac os x' || os === 'macos'));

    if (isTabletSignal) {
      return 'tablet';
    }

    // Default to desktop
    return this.isServerEvent(mp_lib) ? 'server' : 'desktop';
  }

  private isWebEvent(mp_lib: string) {
    return [
      'web',
      'android',
      'iphone',
      'swift',
      'unity',
      'react-native',
    ].includes(mp_lib);
  }

  private isServerEvent(mp_lib: string) {
    return !this.isWebEvent(mp_lib);
  }

  private parseServerDeviceInfo(props: Record<string, any>): UserAgentInfo {
    // For mobile events, extract device information from Mixpanel properties
    const os = props.$os || props.os || '';
    const osVersion = props.$os_version || props.osVersion || '';
    const brand = props.$brand || props.phoneBrand || '';
    const model = props.$model || props.phoneModel || '';
    const device = os.toLowerCase();

    return {
      isServer: true,
      os,
      osVersion,
      browser: '',
      browserVersion: '',
      device,
      brand,
      model,
    };
  }

  private stripMixpanelProperties(
    properties: Record<string, any>,
    searchParams: Record<string, string>
  ): Record<string, any> {
    const strip = [
      'time',
      'distinct_id',
      'current_page_title',
      'current_url_path',
      'current_url_protocol',
      'current_url_search',
      'current_domain',
      ...Object.keys(searchParams),
    ];
    const filtered = Object.fromEntries(
      Object.entries(properties).filter(
        ([key]) => !(key.match(/^(\$|mp_|utm_)/) || strip.includes(key))
      )
    );

    // Parse JSON strings back to objects/arrays so toDots() can flatten them
    const parsed: Record<string, any> = {};
    for (const [key, value] of Object.entries(filtered)) {
      if (
        typeof value === 'string' &&
        (value.startsWith('{') || value.startsWith('['))
      ) {
        try {
          parsed[key] = JSON.parse(value);
        } catch {
          parsed[key] = value; // Keep as string if parsing fails
        }
      } else {
        parsed[key] = value;
      }
    }

    return parsed;
  }
}
