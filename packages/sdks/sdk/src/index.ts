import type {
  IAliasPayload as AliasPayload,
  IDecrementPayload as DecrementPayload,
  IIdentifyPayload as IdentifyPayload,
  IIncrementPayload as IncrementPayload,
  ITrackHandlerPayload as TrackHandlerPayload,
  ITrackPayload as TrackPayload,
} from '@openpanel/validation';
import { Api } from './api';

export type {
  AliasPayload,
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  TrackHandlerPayload,
  TrackPayload,
};

export type TrackProperties = {
  [key: string]: unknown;
  profileId?: string;
};

export type OpenPanelOptions = {
  clientId: string;
  clientSecret?: string;
  apiUrl?: string;
  sdk?: string;
  sdkVersion?: string;
  waitForProfile?: boolean;
  filter?: (payload: TrackHandlerPayload) => boolean;
  disabled?: boolean;
  debug?: boolean;
};

export class OpenPanel {
  api: Api;
  profileId?: string;
  deviceId?: string;
  sessionId?: string;
  global?: Record<string, unknown>;
  queue: TrackHandlerPayload[] = [];

  constructor(public options: OpenPanelOptions) {
    const defaultHeaders: Record<string, string> = {
      'openpanel-client-id': options.clientId,
    };

    if (options.clientSecret) {
      defaultHeaders['openpanel-client-secret'] = options.clientSecret;
    }

    defaultHeaders['openpanel-sdk-name'] = options.sdk || 'node';
    defaultHeaders['openpanel-sdk-version'] =
      options.sdkVersion || process.env.SDK_VERSION!;

    this.api = new Api({
      baseUrl: options.apiUrl || 'https://api.openpanel.dev',
      defaultHeaders,
    });
  }

  // placeholder for future use
  init() {
    // empty
  }

  ready() {
    this.options.waitForProfile = false;
    this.flush();
  }

  private shouldQueue(payload: TrackHandlerPayload): boolean {
    if (payload.type === 'replay' && !this.sessionId) {
      return true;
    }
    if (this.options.waitForProfile && !this.profileId) {
      return true;
    }
    return false;
  }

  async send(payload: TrackHandlerPayload) {
    if (this.options.disabled) {
      return Promise.resolve();
    }

    if (this.options.filter && !this.options.filter(payload)) {
      return Promise.resolve();
    }

    if (this.shouldQueue(payload)) {
      this.queue.push(payload);
      return Promise.resolve();
    }

    // Disable keepalive for replay since it has a hard body limit and breaks the request
    const result = await this.api.fetch<
      TrackHandlerPayload,
      { deviceId: string; sessionId: string }
    >('/track', payload, { keepalive: payload.type !== 'replay' });
    this.deviceId = result?.deviceId;
    const hadSession = !!this.sessionId;
    this.sessionId = result?.sessionId;

    // Flush queued items (e.g. replay chunks) when sessionId first arrives
    if (!hadSession && this.sessionId) {
      this.flush();
    }

    return result;
  }

  setGlobalProperties(properties: Record<string, unknown>) {
    this.global = {
      ...this.global,
      ...properties,
    };
  }

  async track(name: string, properties?: TrackProperties) {
    this.log('track event', name, properties);
    return this.send({
      type: 'track',
      payload: {
        name,
        profileId: properties?.profileId ?? this.profileId,
        properties: {
          ...(this.global ?? {}),
          ...(properties ?? {}),
        },
      },
    });
  }

  async identify(payload: IdentifyPayload) {
    this.log('identify user', payload);
    if (payload.profileId) {
      this.profileId = payload.profileId;
      this.flush();
    }

    if (Object.keys(payload).length > 1) {
      return this.send({
        type: 'identify',
        payload: {
          ...payload,
          properties: {
            ...this.global,
            ...payload.properties,
          },
        },
      });
    }
  }

  /**
   * @deprecated This method is deprecated and will be removed in a future version.
   */
  async alias(payload: AliasPayload) {}

  async increment(payload: IncrementPayload) {
    return this.send({
      type: 'increment',
      payload,
    });
  }

  async decrement(payload: DecrementPayload) {
    return this.send({
      type: 'decrement',
      payload,
    });
  }

  async revenue(
    amount: number,
    properties?: TrackProperties & { deviceId?: string },
  ) {
    const deviceId = properties?.deviceId;
    delete properties?.deviceId;
    return this.track('revenue', {
      ...(properties ?? {}),
      ...(deviceId ? { __deviceId: deviceId } : {}),
      __revenue: amount,
    });
  }

  getDeviceId(): string {
    return this.deviceId ?? '';
  }

  getSessionId(): string {
    return this.sessionId ?? '';
  }

  async fetchDeviceId(): Promise<string> {
    return Promise.resolve(this.deviceId ?? '');
  }

  clear() {
    this.profileId = undefined;
    this.deviceId = undefined;
    this.sessionId = undefined;
  }

  flush() {
    const remaining: TrackHandlerPayload[] = [];
    for (const item of this.queue) {
      if (this.shouldQueue(item)) {
        remaining.push(item);
        continue;
      }
      const payload =
        item.type === 'replay'
          ? item.payload
          : {
              ...item.payload,
              profileId:
                'profileId' in item.payload
                  ? (item.payload.profileId ?? this.profileId)
                  : this.profileId,
            };
      this.send({ ...item, payload } as TrackHandlerPayload);
    }
    this.queue = remaining;
  }

  log(...args: any[]) {
    if (this.options.debug) {
      console.log('[OpenPanel.dev]', ...args);
    }
  }
}
