import type {
  EventPayload,
  MixanErrorResponse,
  ProfilePayload,
} from '@mixan/types';

export interface NewMixanOptions {
  url: string;
  clientId: string;
  clientSecret: string;
  batchInterval?: number;
  maxBatchSize?: number;
  sessionTimeout?: number;
  session?: boolean;
  verbose?: boolean;
  setItem: (key: string, profileId: string) => void;
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  trackIp?: boolean;
}
export type MixanOptions = Required<NewMixanOptions>;

class Fetcher {
  private url: string;
  private clientId: string;
  private clientSecret: string;
  private logger: (...args: any[]) => void;

  constructor(options: MixanOptions) {
    this.url = options.url;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.logger = options.verbose ? console.log : () => {};
  }

  post<PostData, PostResponse>(
    path: string,
    data?: PostData,
    options?: RequestInit
  ): Promise<PostResponse | null> {
    const url = `${this.url}${path}`;
    this.logger(`Mixan request: ${url}`, JSON.stringify(data, null, 2));

    return fetch(url, {
      headers: {
        ['mixan-client-id']: this.clientId,
        ['mixan-client-secret']: this.clientSecret,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(data ?? {}),
      keepalive: true,
      ...(options ?? {}),
    })
      .then(async (res) => {
        const response = (await res.json()) as
          | MixanErrorResponse
          | PostResponse;

        if (!response) {
          return null;
        }

        if (
          typeof response === 'object' &&
          'status' in response &&
          response.status === 'error'
        ) {
          this.logger(
            `Mixan request failed: [${options?.method ?? 'POST'}] ${url}`,
            JSON.stringify(response, null, 2)
          );
          return null;
        }

        return response as PostResponse;
      })
      .catch(() => {
        this.logger(
          `Mixan request failed: [${options?.method ?? 'POST'}] ${url}`
        );
        return null;
      });
  }
}

class Batcher<T> {
  queue: T[] = [];
  timer?: ReturnType<typeof setTimeout>;
  callback: (queue: T[]) => void;
  maxBatchSize: number;
  batchInterval: number;

  constructor(options: MixanOptions, callback: (queue: T[]) => void) {
    this.callback = callback;
    this.maxBatchSize = options.maxBatchSize;
    this.batchInterval = options.batchInterval;
  }

  add(payload: T) {
    this.queue.push(payload);
    this.flush();
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (this.queue.length === 0) {
      return;
    }

    if (this.queue.length >= this.maxBatchSize) {
      this.send();
      return;
    }

    this.timer = setTimeout(this.send.bind(this), this.batchInterval);
  }

  send() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (this.queue.length > 0) {
      this.callback(this.queue);
      this.queue = [];
    }
  }
}

export class Mixan {
  private fetch: Fetcher;
  private eventBatcher: Batcher<EventPayload>;
  private profileId?: string;
  private options: MixanOptions;
  private logger: (...args: any[]) => void;
  private globalProperties: Record<string, unknown> = {};
  private lastEventAt: string;
  private promiseIp: Promise<string | null>;

  constructor(options: NewMixanOptions) {
    this.logger = options.verbose ? console.log : () => {};
    this.options = {
      sessionTimeout: 1000 * 60 * 30,
      session: true,
      verbose: false,
      batchInterval: 10000,
      maxBatchSize: 10,
      trackIp: false,
      ...options,
    };

    this.lastEventAt =
      this.options.getItem('@mixan:lastEventAt') ?? '1970-01-01';
    this.fetch = new Fetcher(this.options);
    this.eventBatcher = new Batcher(this.options, (queue) => {
      this.fetch.post(
        '/events',
        queue.map((item) => ({
          ...item,
          properties: {
            ...this.globalProperties,
            ...item.properties,
          },
          profileId: item.profileId ?? this.profileId ?? null,
        }))
      );
    });

    this.promiseIp = this.options.trackIp
      ? fetch('https://api.ipify.org')
          .then((res) => res.text())
          .catch(() => null)
      : Promise.resolve(null);
  }

  async ip() {
    return this.promiseIp;
  }

  timestamp(modify = 0) {
    return new Date(Date.now() + modify).toISOString();
  }

  init(properties?: Record<string, unknown>) {
    if (properties) {
      this.setGlobalProperties(properties);
    }
    this.logger('Mixan: Init');
    this.setAnonymousUser();
  }

  event(name: string, properties: Record<string, unknown> = {}) {
    const now = new Date();
    const isSessionStart =
      this.options.session &&
      now.getTime() - new Date(this.lastEventAt).getTime() >
        this.options.sessionTimeout;

    if (isSessionStart) {
      this.logger('Mixan: Session start');
      this.eventBatcher.add({
        name: 'session_start',
        time: this.timestamp(-10),
        properties: {},
        profileId: this.profileId ?? null,
      });
    }

    this.logger('Mixan: Queue event', name);
    this.eventBatcher.add({
      name,
      properties,
      time: this.timestamp(),
      profileId: this.profileId ?? null,
    });
    this.lastEventAt = this.timestamp();
    this.options.setItem('@mixan:lastEventAt', this.lastEventAt);
  }

  private async setAnonymousUser(retryCount = 0) {
    const profileId = this.options.getItem('@mixan:profileId');
    if (profileId) {
      this.profileId = profileId;
      await this.setUser({
        properties: this.globalProperties,
      });
      this.logger('Mixan: Use existing profile', this.profileId);
    } else {
      const res = await this.fetch.post<ProfilePayload, { id: string }>(
        '/profiles',
        {
          properties: this.globalProperties,
        }
      );

      if (res) {
        this.profileId = res.id;
        this.options.setItem('@mixan:profileId', res.id);
        this.logger('Mixan: Create new profile', this.profileId);
      } else if (retryCount < 2) {
        setTimeout(() => {
          this.setAnonymousUser(retryCount + 1);
        }, 500);
      } else {
        this.logger('Mixan: Failed to create new profile');
      }
    }
  }

  async setUser(profile: ProfilePayload) {
    if (!this.profileId) {
      return this.logger('Mixan: Set user failed, no profileId');
    }
    this.logger('Mixan: Set user', profile);
    await this.fetch.post(`/profiles/${this.profileId}`, profile, {
      method: 'PUT',
    });
  }

  async setUserProperty(
    name: string,
    value: string | number | boolean | Record<string, unknown> | unknown[]
  ) {
    if (!this.profileId) {
      return this.logger('Mixan: Set user property, no profileId');
    }
    this.logger('Mixan: Set user property', name, value);
    await this.fetch.post(`/profiles/${this.profileId}`, {
      properties: {
        [name]: value,
      },
    });
  }

  setGlobalProperties(properties: Record<string, unknown>) {
    if (typeof properties !== 'object') {
      return this.logger(
        'Mixan: Set global properties failed, properties must be an object'
      );
    }
    this.logger('Mixan: Set global properties', properties);
    this.globalProperties = {
      ...this.globalProperties,
      ...properties,
    };
  }

  async increment(name: string, value = 1) {
    if (!this.profileId) {
      this.logger('Mixan: Increment failed, no profileId');
      return;
    }

    this.logger('Mixan: Increment user property', name, value);
    await this.fetch.post(
      `/profiles/${this.profileId}/increment`,
      {
        name,
        value,
      },
      {
        method: 'PUT',
      }
    );
  }

  async decrement(name: string, value = 1) {
    if (!this.profileId) {
      this.logger('Mixan: Decrement failed, no profileId');
      return;
    }

    this.logger('Mixan: Decrement user property', name, value);
    await this.fetch.post(
      `/profiles/${this.profileId}/decrement`,
      {
        name,
        value,
      },
      {
        method: 'PUT',
      }
    );
  }

  flush() {
    this.logger('Mixan: Flushing events queue');
    this.eventBatcher.send();
  }

  clear() {
    this.logger('Mixan: Clear, send remaining events and remove profileId');
    this.eventBatcher.send();
    this.options.removeItem('@mixan:profileId');
    this.options.removeItem('@mixan:session');
    this.profileId = undefined;
    this.setAnonymousUser();
  }
}
