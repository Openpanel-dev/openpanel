// Hand-duplicated on purpose, not imported: the wire contract's source of
// truth is @openpanel/core/modules/ingest/ingest.constants.ts, but core's
// package.json exports map is deliberately narrow (no `./*` wildcard) and
// rollup-plugin-dts (tsup's dts bundler) cannot inline a type that resolves
// through that map's `*` pattern: it leaves an unresolvable
// `@openpanel/core/...` reference in dist/index.d.ts, which breaks for every
// consumer since core isn't published. A plain deep import into any
// workspace-internal shim package hits the same wall one hop later, since
// those packages now just re-export core's. Keeping a literal copy here is
// what keeps this package's shipped .d.ts self-contained.
import { Api } from './api';

export type ProfileId = string | number;

export interface AliasPayload {
  profileId: ProfileId;
  alias: string;
}

export interface AssignGroupPayload {
  groupIds: string[];
  profileId?: ProfileId;
}

export interface DecrementPayload {
  profileId: ProfileId;
  property: string;
  value?: number;
}

export interface GroupPayload {
  id: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
}

export interface IdentifyPayload {
  profileId: ProfileId;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  properties?: Record<string, unknown>;
}

export interface IncrementPayload {
  profileId: ProfileId;
  property: string;
  value?: number;
}

export interface TrackPayload {
  name: string;
  properties?: Record<string, unknown>;
  profileId?: ProfileId;
  groups?: string[] | null;
}

export interface ReplayPayload {
  chunk_index: number;
  events_count: number;
  is_full_snapshot: boolean;
  started_at: string;
  ended_at: string;
  payload: string;
  // Server-issued session id (from a prior /track response) the SDK echoes back,
  // so the chunk is filed under the right session without device resolution.
  sessionId?: string;
}

export type TrackHandlerPayload =
  | { type: 'track'; payload: TrackPayload }
  | { type: 'identify'; payload: IdentifyPayload }
  | { type: 'increment'; payload: IncrementPayload }
  | { type: 'decrement'; payload: DecrementPayload }
  | { type: 'alias'; payload: AliasPayload }
  | { type: 'replay'; payload: ReplayPayload }
  | { type: 'group'; payload: GroupPayload }
  | { type: 'assign_group'; payload: AssignGroupPayload };

export interface TrackProperties {
  [key: string]: unknown;
  profileId?: string;
  groups?: string[];
}

export type UpsertGroupPayload = GroupPayload;

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
  profileId?: string | number;
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

  init() {}

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

    if (payload.profileId && Object.keys(payload).length > 1) {
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

  upsertGroup(payload: UpsertGroupPayload) {
    this.log('upsert group', payload);
    return this.send({
      type: 'group',
      payload,
    });
  }

  setGroup(groupId: string) {
    this.log('set group', groupId);
    if (!this.groups.includes(groupId)) {
      this.groups = [...this.groups, groupId];
    }
    return this.send({
      type: 'assign_group',
      payload: {
        groupIds: [groupId],
        profileId: this.profileId,
      },
    });
  }

  setGroups(groupIds: string[]) {
    this.log('set groups', groupIds);
    this.groups = [...new Set([...this.groups, ...groupIds])];
    return this.send({
      type: 'assign_group',
      payload: {
        groupIds,
        profileId: this.profileId,
      },
    });
  }

  /**
   * @deprecated This method is deprecated and will be removed in a future version.
   */
  alias(_payload: AliasPayload) {}

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
    if (item.type === 'assign_group') {
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
