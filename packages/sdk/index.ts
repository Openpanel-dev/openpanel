import type {
  BatchPayload,
  BatchUpdateProfilePayload,
  BatchUpdateSessionPayload,
  MixanErrorResponse,
} from '@mixan/types';

type MixanLogger = (...args: unknown[]) => void;

// -- 1. Besök
// -- 2. Finns profile id?
// --   NEJ
// --   a. skicka events som vanligt (retunera genererat ID)
// --   b. ge möjlighet att spara
// --   JA
// --   a. skicka event med profile_id
// -- Payload
// -- - user_agent?
// -- - ip?
// -- - profile_id?
// -- - referrer

export interface NewMixanOptions {
  url: string;
  clientId: string;
  clientSecret?: string;
  verbose?: boolean;
  setItem?: (key: string, profileId: string) => void;
  getItem?: (key: string) => string | null;
  removeItem?: (key: string) => void;
}

export type MixanOptions = Required<NewMixanOptions>;

export interface MixanState {
  profileId: null | string;
  properties: Record<string, unknown>;
}

function createLogger(verbose: boolean): MixanLogger {
  return verbose ? (...args) => console.log('[Mixan]', ...args) : () => {};
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

export class Mixan {
  private options: MixanOptions;
  private fetch: Fetcher;
  private logger: (...args: any[]) => void;
  private state: MixanState = {
    profileId: null,
    properties: {},
  };

  constructor(options: NewMixanOptions) {
    this.logger = createLogger(options.verbose ?? false);
    this.options = {
      verbose: false,
      clientSecret: '',
      ...options,
    };
    this.fetch = new Fetcher(this.options, this.logger);
  }

  // Public

  public init(properties?: Record<string, unknown>) {
    this.logger('Init');
    this.state.properties = properties ?? {};
  }

  public setUser(payload: Omit<BatchUpdateProfilePayload, 'profileId'>) {
    this.batcher.add({
      type: 'update_profile',
      payload: {
        ...payload,
        properties: payload.properties ?? {},
        profileId: this.state.profileId,
      },
    });
  }

  public increment(name: string, value: number) {
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
    this.fetch
      .post('/event', {
        name,
        properties: {
          ...this.state.properties,
          ...(properties ?? {}),
        },
        time: this.timestamp(),
        profileId: this.state.profileId,
      })
      .then((response) => {
        if ('profileId' in response) {
          this.options.setItem('@mixan:profileId', response.profileId);
        }
      });
  }

  public setGlobalProperties(properties: Record<string, unknown>) {
    this.logger('Set global properties', properties);
    this.state.properties = {
      ...this.state.properties,
      ...properties,
    };
  }

  public clear() {
    this.logger('Clear / Logout');
    this.options.removeItem('@mixan:profileId');
    this.state.profileId = null;
  }

  public setUserProperty(name: string, value: unknown, update = true) {
    // this.batcher.add({
    //   type: 'set_profile_property',
    //   payload: {
    //     name,
    //     value,
    //     update,
    //     profileId: this.state.profileId,
    //   },
    // });
  }

  // Private

  private timestamp() {
    return new Date().toISOString();
  }
}
