/** biome-ignore-all lint/style/noExportedImports: lazy */

import type {
  IAliasPayload as AliasPayload,
  IDecrementPayload as DecrementPayload,
  IGroupPayload as GroupPayload,
  IIdentifyPayload as IdentifyPayload,
  IIncrementPayload as IncrementPayload,
  ITrackHandlerPayload as TrackHandlerPayload,
  ITrackPayload as TrackPayload,
} from '@openpanel/validation';
import { Api } from './api';

export type {
  AliasPayload,
  DecrementPayload,
  GroupPayload,
  IdentifyPayload,
  IncrementPayload,
  TrackHandlerPayload,
  TrackPayload,
};

export interface TrackProperties {
  [key: string]: unknown;
  profileId?: string;
  groups?: string[];
}

export type GroupMetadata = Omit<GroupPayload, 'id'>;

export interface OpenPanelOptions {
  clientId: string;
  clientSecret?: string;
  apiUrl?: string;
  sdk?: string;
  sdkVersion?: string;
  /**
   * @deprecated Queue events until `identify()` is called with a profileId.
   * For manual queue control use `disabled: true` + `ready()` instead.
   */
  waitForProfile?: boolean;
  filter?: (payload: TrackHandlerPayload) => boolean;
  /** When true, events are queued until `ready()` is called (same as waitForProfile). */
  disabled?: boolean;
  debug?: boolean;
}

export class OpenPanel {
  api: Api;
  options: OpenPanelOptions;
  profileId?: string;
  groups: string[] = [];
  deviceId?: string;
  sessionId?: string;
  global?: Record<string, unknown>;
  queue: TrackHandlerPayload[] = [];

  constructor(options: OpenPanelOptions) {
    this.options = options;

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
    this.options.disabled = false;
    this.options.waitForProfile = false;
    this.flush();
  }

  private shouldQueue(payload: TrackHandlerPayload): boolean {
    if (this.options.disabled) {
      return true;
    }
    if (this.options.waitForProfile && !this.profileId) {
      return true;
    }
    if (payload.type === 'replay' && !this.sessionId) {
      return true;
    }
    return false;
  }

  addQueue(payload: TrackHandlerPayload) {
    if (payload.type === 'track') {
      payload.payload.properties = {
        ...(payload.payload.properties ?? {}),
        __timestamp: new Date().toISOString(),
      };
    }

    this.queue.push(payload);
  }

  async send(payload: TrackHandlerPayload) {
    if (this.options.filter && !this.options.filter(payload)) {
      return Promise.resolve();
    }

    if (this.shouldQueue(payload)) {
      this.addQueue(payload);
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

  track(name: string, properties?: TrackProperties) {
    this.log('track event', name, properties);
    const { groups: groupsOverride, profileId, ...rest } = properties ?? {};
    const mergedGroups = [
      ...new Set([...this.groups, ...(groupsOverride ?? [])]),
    ];
    return this.send({
      type: 'track',
      payload: {
        name,
        profileId: profileId ?? this.profileId,
        groups: mergedGroups.length > 0 ? mergedGroups : undefined,
        properties: {
          ...(this.global ?? {}),
          ...rest,
        },
      },
    });
  }

  identify(payload: IdentifyPayload) {
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

  setGroups(groupIds: string[]) {
    this.log('set groups', groupIds);
    this.groups = groupIds;
  }

  setGroup(groupId: string, metadata?: GroupMetadata) {
    this.log('set group', groupId, metadata);
    if (!this.groups.includes(groupId)) {
      this.groups = [...this.groups, groupId];
    }
    if (metadata) {
      return this.send({
        type: 'group',
        payload: {
          id: groupId,
          ...metadata,
          profileId: this.profileId,
        },
      });
    }
  }

  /**
   * @deprecated This method is deprecated and will be removed in a future version.
   */
  alias(_payload: AliasPayload) {
    // noop
  }

  increment(payload: IncrementPayload) {
    return this.send({
      type: 'increment',
      payload,
    });
  }

  decrement(payload: DecrementPayload) {
    return this.send({
      type: 'decrement',
      payload,
    });
  }

  revenue(
    amount: number,
    properties?: TrackProperties & { deviceId?: string }
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

  /**
   * @deprecated Use `getDeviceId()` instead. This async method is no longer needed.
   */
  fetchDeviceId(): Promise<string> {
    return Promise.resolve(this.deviceId ?? '');
  }

  clear() {
    this.profileId = undefined;
    this.groups = [];
    this.deviceId = undefined;
    this.sessionId = undefined;
  }

  private buildFlushPayload(
    item: TrackHandlerPayload
  ): TrackHandlerPayload['payload'] {
    if (item.type === 'replay') {
      return item.payload;
    }
    if (item.type === 'track') {
      const queuedGroups =
        'groups' in item.payload ? (item.payload.groups ?? []) : [];
      const mergedGroups = [...new Set([...this.groups, ...queuedGroups])];
      return {
        ...item.payload,
        profileId: item.payload.profileId ?? this.profileId,
        groups: mergedGroups.length > 0 ? mergedGroups : undefined,
      };
    }
    if (
      item.type === 'identify' ||
      item.type === 'increment' ||
      item.type === 'decrement'
    ) {
      return {
        ...item.payload,
        profileId: item.payload.profileId ?? this.profileId,
      } as TrackHandlerPayload['payload'];
    }
    if (item.type === 'group') {
      return {
        ...item.payload,
        profileId: item.payload.profileId ?? this.profileId,
      };
    }
    return item.payload;
  }

  flush() {
    const remaining: TrackHandlerPayload[] = [];
    for (const item of this.queue) {
      if (this.shouldQueue(item)) {
        remaining.push(item);
        continue;
      }
      const payload = this.buildFlushPayload(item);
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
