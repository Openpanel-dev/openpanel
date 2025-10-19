import { randomUUID } from 'node:crypto';
import { isSameDomain, parsePath, toDots } from '@openpanel/common';
import { type UserAgentInfo, parseUserAgent } from '@openpanel/common/server';
import { getReferrerWithQuery, parseReferrer } from '@openpanel/common/server';
import type { IClickhouseEvent } from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { IMixpanelImportConfig } from '@openpanel/validation';
import { z } from 'zod';
import { BaseImportProvider } from '../base-provider';

export const zMixpanelRawEvent = z.object({
  event: z.string(),
  properties: z.record(z.unknown()),
});

export type MixpanelRawEvent = z.infer<typeof zMixpanelRawEvent>;

export class MixpanelProvider extends BaseImportProvider<MixpanelRawEvent> {
  provider = 'mixpanel';
  version = '1.0.0';

  constructor(
    private readonly projectId: string,
    private readonly config: IMixpanelImportConfig,
    private readonly logger?: ILogger,
  ) {
    super();
  }

  async getTotalEventsCount(): Promise<number> {
    // Mixpanel sucks and dont provide a good way to extract total event count within a period
    // jql would work but not accurate and will be deprecated end of 2025
    return -1;
  }

  /**
   * Mixpanel doesn't provide session IDs, so we need to generate them in SQL
   * after all events are imported to ensure deterministic results
   */
  shouldGenerateSessionIds(): boolean {
    return true;
  }

  async *parseSource(
    overrideFrom?: string,
  ): AsyncGenerator<MixpanelRawEvent, void, unknown> {
    yield* this.fetchEventsFromMixpanel(overrideFrom);
  }

  private async *fetchEventsFromMixpanel(
    overrideFrom?: string,
  ): AsyncGenerator<MixpanelRawEvent, void, unknown> {
    const { serviceAccount, serviceSecret, projectId, from, to } = this.config;

    // Split the date range into monthly chunks for reliability
    // Uses base class utility to avoid timeout issues with large date ranges
    const dateChunks = this.getDateChunks(overrideFrom ?? from, to); // 1 month per chunk

    for (const [chunkFrom, chunkTo] of dateChunks) {
      yield* this.fetchEventsForDateRange(
        serviceAccount,
        serviceSecret,
        projectId,
        chunkFrom,
        chunkTo,
      );
    }
  }

  private async *fetchEventsForDateRange(
    serviceAccount: string,
    serviceSecret: string,
    projectId: string,
    from: string,
    to: string,
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

    if (!response.ok) {
      throw new Error(
        `Failed to fetch events from Mixpanel: ${response.status} ${response.statusText}`,
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

        if (done) break;

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
              console.warn('Failed to parse Mixpanel event:', line);
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
          console.warn('Failed to parse final Mixpanel event:', buffer);
        }
      }
    } finally {
      reader.releaseLock();
    }
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
      '',
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
    properties.__query = query || {};
    if (props.utm_source) {
      properties.__query.utm_source = props.utm_source;
    }
    if (props.utm_medium) {
      properties.__query.utm_medium = props.utm_medium;
    }
    if (props.utm_campaign) {
      properties.__query.utm_campaign = props.utm_campaign;
    }
    if (props.utm_term) {
      properties.__query.utm_term = props.utm_term;
    }
    if (props.utm_content) {
      properties.__query.utm_content = props.utm_content;
    }
    if (Object.keys(properties.__query).length === 0) {
      properties.__query = null;
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
      properties: toDots(properties),
      created_at: new Date(props.time * 1000).toISOString(),
      country,
      city,
      region,
      longitude: null,
      latitude: null,
      os: uaInfo.os || props.$os,
      os_version: uaInfo.osVersion || props.$osVersion,
      browser: uaInfo.browser || props.$browser,
      browser_version:
        uaInfo.browserVersion || props.$browserVersion
          ? String(props.$browser_version)
          : '',
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
      sdk_name: this.provider,
      sdk_version: this.version,
    };

    // TODO: Remove this
    const isMightBeScreenView = this.getMightBeScreenView(rawEvent);
    if (isMightBeScreenView && event.name === 'Loaded a Screen') {
      event.name = 'screen_view';
      event.path = isMightBeScreenView;
    }

    return event;
  }

  private getDeviceType(
    mp_lib: string,
    uaInfo: UserAgentInfo,
    props: Record<string, any>,
  ) {
    if (this.isServerEvent(mp_lib)) {
      return 'server';
    }

    if (uaInfo.device !== 'server') {
      return uaInfo.device;
    }

    // Use browser and OS to determine device type
    const browser = (props.$browser || '').toLowerCase();
    const os = (props.$os || '').toLowerCase();

    // Mobile browsers
    if (
      browser.includes('mobile safari') ||
      browser.includes('chrome ios') ||
      browser.includes('android mobile') ||
      browser.includes('samsung internet') ||
      os === 'ios' ||
      os === 'android'
    ) {
      return 'mobile';
    }

    // Tablet indicators (iPad, Android tablets)
    if (
      (browser.includes('mobile safari') && os === 'mac os x') ||
      (browser.includes('samsung internet') && os === 'linux') ||
      os === 'chrome os'
    ) {
      return 'tablet';
    }

    // Everything else is desktop
    return uaInfo.device;
  }

  private isWebEvent(mp_lib: string) {
    return mp_lib === 'web';
  }

  private isServerEvent(mp_lib: string) {
    return ![
      'web',
      'android',
      'iphone',
      'swift',
      'unity',
      'react-native',
    ].includes(mp_lib);
  }

  private getMightBeScreenView(rawEvent: MixpanelRawEvent) {
    const props = rawEvent.properties as Record<string, any>;
    return Object.keys(props).find((key) => key.match(/^[A-Z1-9_]+$/));
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
      os: os,
      osVersion: osVersion,
      browser: '',
      browserVersion: '',
      device: device,
      brand: brand,
      model: model,
    };
  }

  private stripMixpanelProperties(
    properties: Record<string, any>,
    searchParams: Record<string, string>,
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
        ([key]) => !key.match(/^(\$|mp_|utm_)/) && !strip.includes(key),
      ),
    );

    // Coerce all values to strings to satisfy Map(String, String)
    const stringProperties: Record<string, string> = {};
    for (const [key, value] of Object.entries(filtered)) {
      if (value === null || value === undefined) {
        stringProperties[key] = '';
        continue;
      }
      if (typeof value === 'object') {
        try {
          stringProperties[key] = JSON.stringify(value);
        } catch {
          stringProperties[key] = String(value);
        }
      } else {
        stringProperties[key] = String(value);
      }
    }

    return stringProperties;
  }
}
