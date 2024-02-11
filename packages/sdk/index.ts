import type {
  DecrementProfilePayload,
  IncrementProfilePayload,
  PostEventPayload,
  UpdateProfilePayload,
} from '@mixan/types';

export interface MixanOptions {
  url: string;
  clientId: string;
  clientSecret?: string;
  verbose?: boolean;
  setProfileId?: (profileId: string) => void;
  getProfileId?: () => string | null | undefined;
  removeProfileId?: () => void;
}

export interface MixanState {
  profileId?: string;
  properties: Record<string, unknown>;
}

function awaitProperties(
  properties: Record<string, string | Promise<string | null>>
): Promise<Record<string, string>> {
  return Promise.all(
    Object.entries(properties).map(async ([key, value]) => {
      return [key, (await value) ?? ''];
    })
  ).then((entries) => Object.fromEntries(entries));
}

function createApi(_url: string) {
  const headers: Record<string, string | Promise<string | null>> = {
    'Content-Type': 'application/json',
  };
  return {
    headers,
    async fetch<ReqBody, ResBody>(
      path: string,
      data: ReqBody,
      options?: RequestInit
    ): Promise<ResBody | null> {
      const url = `${_url}${path}`;
      let timer: ReturnType<typeof setTimeout>;
      const h = await awaitProperties(headers);
      return new Promise((resolve) => {
        const wrappedFetch = (attempt: number) => {
          clearTimeout(timer);
          fetch(url, {
            headers: h,
            method: 'POST',
            body: JSON.stringify(data ?? {}),
            keepalive: true,
            ...(options ?? {}),
          })
            .then(async (res) => {
              if (res.status !== 200 && res.status !== 202) {
                return retry(attempt, resolve);
              }

              const response = await res.text();

              if (!response) {
                return resolve(null);
              }

              resolve(response as ResBody);
            })
            .catch(() => {
              return retry(attempt, resolve);
            });
        };

        function retry(
          attempt: number,
          resolve: (value: ResBody | null) => void
        ) {
          if (attempt > 1) {
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
    },
  };
}

export class Mixan<Options extends MixanOptions = MixanOptions> {
  public options: Options;
  public api: ReturnType<typeof createApi>;
  private state: MixanState = {
    properties: {},
  };

  constructor(options: Options) {
    this.options = options;
    this.api = createApi(options.url);
    this.api.headers['mixan-client-id'] = options.clientId;
    if (this.options.clientSecret) {
      this.api.headers['mixan-client-secret'] = this.options.clientSecret;
    }
  }

  // Public

  public init(properties?: Record<string, unknown>) {
    this.state.properties = properties ?? {};
  }

  public setUser(payload: Omit<UpdateProfilePayload, 'profileId'>) {
    this.api.fetch<UpdateProfilePayload, string>('/profile', {
      profileId: this.getProfileId(),
      ...payload,
      properties: {
        ...this.state.properties,
        ...payload.properties,
      },
    });
  }

  public increment(property: string, value: number) {
    this.api.fetch<IncrementProfilePayload, string>('/profile/increment', {
      property,
      value,
      profileId: this.getProfileId(),
    });
  }

  public decrement(property: string, value: number) {
    this.api.fetch<DecrementProfilePayload, string>('/profile/decrement', {
      property,
      value,
      profileId: this.getProfileId(),
    });
  }

  public event(name: string, properties?: Record<string, unknown>) {
    this.api
      .fetch<PostEventPayload, string>('/event', {
        name,
        properties: {
          ...this.state.properties,
          ...(properties ?? {}),
        },
        timestamp: this.timestamp(),
        profileId: this.getProfileId(),
      })
      .then((profileId) => {
        if (this.options.setProfileId && profileId) {
          this.options.setProfileId(profileId);
        }
      });
  }

  public setGlobalProperties(properties: Record<string, unknown>) {
    this.state.properties = {
      ...this.state.properties,
      ...properties,
    };
  }

  public clear() {
    this.state.profileId = undefined;
    if (this.options.removeProfileId) {
      this.options.removeProfileId();
    }
  }

  // Private

  private timestamp() {
    return new Date().toISOString();
  }

  private getProfileId() {
    if (this.state.profileId) {
      return this.state.profileId;
    } else if (this.options.getProfileId) {
      this.state.profileId = this.options.getProfileId() || undefined;
    }
  }
}
