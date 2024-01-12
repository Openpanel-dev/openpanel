import type {
  BatchPayload,
  BatchUpdateProfilePayload,
  BatchUpdateSessionPayload,
  MixanErrorResponse,
} from '@mixan/types';

type MixanLogger = (...args: unknown[]) => void;

export interface NewMixanOptions {
  url: string;
  clientId: string;
  clientSecret?: string;
  batchInterval?: number;
  maxBatchSize?: number;
  sessionTimeout?: number;
  session?: boolean;
  verbose?: boolean;
  trackIp?: boolean;
  ipUrl?: string;
  setItem: (key: string, profileId: string) => void;
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
}

export type MixanOptions = Required<NewMixanOptions>;

export interface MixanState {
  profileId: string;
  lastEventAt: number;
  properties: Record<string, unknown>;
}

function createLogger(verbose: boolean): MixanLogger {
  return verbose ? (...args) => console.log('[Mixan]', ...args) : () => {};
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class Fetcher {
  private url: string;
  private clientId: string;
  private clientSecret: string;

  constructor(
    options: MixanOptions,
    private logger: MixanLogger
  ) {
    this.url = options.url;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  post<PostData, PostResponse>(
    path: string,
    data?: PostData,
    options?: RequestInit
  ): Promise<PostResponse | null> {
    const url = `${this.url}${path}`;
    let timer: ReturnType<typeof setTimeout>;

    return new Promise((resolve) => {
      const wrappedFetch = (attempt: number) => {
        clearTimeout(timer);

        this.logger(
          `Request attempt ${attempt + 1}: ${url}`,
          JSON.stringify(data, null, 2)
        );

        fetch(url, {
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
            if (res.status !== 200) {
              return retry(attempt, resolve);
            }

            const response = (await res.json()) as
              | MixanErrorResponse
              | PostResponse;

            if (!response) {
              return resolve(null);
            }

            resolve(response as PostResponse);
          })
          .catch(() => {
            return retry(attempt, resolve);
          });
      };

      function retry(
        attempt: number,
        resolve: (value: PostResponse | null) => void
      ) {
        if (attempt > 3) {
          return resolve(null);
        }

        timer = setTimeout(
          () => {
            wrappedFetch(attempt + 1);
          },
          Math.pow(2, attempt) * 500
        );
      }

      wrappedFetch(0);
    });
  }
}

class Batcher {
  queue: BatchPayload[] = [];
  timer?: ReturnType<typeof setTimeout>;

  constructor(
    private options: MixanOptions,
    private callback: (payload: BatchPayload[]) => void,
    private logger: MixanLogger
  ) {}

  add(action: BatchPayload) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.logger(`Add to queue ${action.type}`);
    this.queue.push(action);

    if (this.queue.length >= this.options.maxBatchSize) {
      this.send();
    } else {
      this.timer = setTimeout(this.send.bind(this), this.options.batchInterval);
    }
  }

  send() {
    this.logger('Send queue', this.queue.length > 0);
    if (this.queue.length > 0) {
      this.callback(this.queue);
      this.queue = [];
    }
  }
}

export class Mixan {
  private options: MixanOptions;
  private fetch: Fetcher;
  private batcher: Batcher;
  private logger: (...args: any[]) => void;
  private state: MixanState = {
    profileId: '',
    lastEventAt: 0,
    properties: {},
  };

  constructor(options: NewMixanOptions) {
    this.logger = createLogger(options.verbose ?? false);
    this.options = {
      sessionTimeout: 1000 * 60 * 30,
      session: true,
      verbose: false,
      batchInterval: 10000,
      maxBatchSize: 10,
      trackIp: false,
      clientSecret: '',
      ipUrl: 'https://api.ipify.org',
      ...options,
    };
    this.fetch = new Fetcher(this.options, this.logger);
    this.batcher = new Batcher(
      this.options,
      (queue) => {
        this.fetch.post('/batch', queue);
      },
      this.logger
    );
  }

  // Public

  public init(properties?: Record<string, unknown>) {
    this.logger('Init');
    this.state.properties = properties ?? {};
    this.createProfile();
    this.createSession();
    this.ipLookup();
  }

  public setUser(payload: Omit<BatchUpdateProfilePayload, 'profileId'>) {
    this.createSession();

    this.batcher.add({
      type: 'update_profile',
      payload: {
        ...payload,
        properties: payload.properties ?? {},
        profileId: this.state.profileId,
      },
    });
  }

  public setSession(properties: BatchUpdateSessionPayload['properties']) {
    this.createSession();

    this.batcher.add({
      type: 'update_session',
      payload: {
        properties,
        profileId: this.state.profileId,
      },
    });
  }

  public increment(name: string, value: number) {
    this.createSession();

    this.batcher.add({
      type: 'increment',
      payload: {
        name,
        value,
        profileId: this.state.profileId,
      },
    });
  }

  public decrement(name: string, value: number) {
    this.createSession();

    this.batcher.add({
      type: 'decrement',
      payload: {
        name,
        value,
        profileId: this.state.profileId,
      },
    });
  }

  public event(name: string, properties?: Record<string, unknown>) {
    this.createSession();

    this.batcher.add({
      type: 'event',
      payload: {
        name,
        properties: {
          ...this.state.properties,
          ...(properties ?? {}),
        },
        time: this.timestamp(),
        profileId: this.state.profileId,
      },
    });
  }

  public setGlobalProperties(properties: Record<string, unknown>) {
    if (typeof properties !== 'object') {
      return this.logger(
        'Set global properties failed, properties must be an object'
      );
    }

    this.logger('Set global properties', properties);
    this.state.properties = {
      ...this.state.properties,
      ...properties,
    };
  }

  public flush() {
    this.batcher.send();
  }

  public clear() {
    this.logger('Clear / Logout');
    this.flush();
    this.options.removeItem('@mixan:ip');
    this.options.removeItem('@mixan:profileId');
    this.options.removeItem('@mixan:lastEventAt');
    this.state.profileId = '';
    this.state.lastEventAt = 0;
    this.createProfile();
  }

  public setUserProperty(name: string, value: unknown, update = true) {
    this.batcher.add({
      type: 'set_profile_property',
      payload: {
        name,
        value,
        update,
        profileId: this.state.profileId,
      },
    });
  }

  // Private

  private timestamp(modify = 0) {
    this.setLastEventAt();
    return new Date(Date.now() + modify).toISOString();
  }

  private createProfile() {
    const profileId = this.options.getItem('@mixan:profileId');

    if (profileId) {
      this.logger('Reusing existing profile');
      this.state.profileId = profileId;
    } else {
      this.logger('Creating profile');
      this.state.profileId = uuid();
      this.options.setItem('@mixan:profileId', this.state.profileId);
      this.batcher.add({
        type: 'create_profile',
        payload: {
          profileId: this.state.profileId,
          properties: this.state.properties,
        },
      });
    }
  }

  private checkSession() {
    if (!this.options.session) {
      return false;
    }

    if (this.state.lastEventAt === 0) {
      const str = this.options.getItem('@mixan:lastEventAt') ?? '0';
      const value = parseInt(str, 10);
      this.state.lastEventAt = isNaN(value) ? 0 : value;
    }

    return Date.now() - this.state.lastEventAt > this.options.sessionTimeout;
  }

  private createSession() {
    if (!this.checkSession()) {
      return;
    }

    const time = this.timestamp(-10);

    this.batcher.add({
      type: 'event',
      payload: {
        name: 'session_start',
        properties: this.state.properties,
        profileId: this.state.profileId,
        time,
      },
    });
  }

  private setLastEventAt() {
    this.state.lastEventAt = Date.now();
    this.options.setItem(
      '@mixan:lastEventAt',
      this.state.lastEventAt.toString()
    );
  }

  private async ipLookup() {
    if (!this.options.trackIp) {
      return null;
    }

    let ip: string | null;

    const cachedIp = this.options.getItem('@mixan:ip');
    if (cachedIp) {
      ip = cachedIp;
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      ip = await fetch(this.options.ipUrl, {
        signal: controller.signal,
      })
        .then((res) => res.text())
        .catch(() => null)
        .finally(() => clearTimeout(timeout));
    }

    if (ip) {
      this.options.setItem('@mixan:ip', ip);
      this.setGlobalProperties({ ip });
      if (!cachedIp) {
        this.setUserProperty('ip', ip, false);
        this.setSession({ ip });
      }
    }
  }
}
