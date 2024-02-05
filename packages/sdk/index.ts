import type { PostEventPayload } from '@mixan/types';

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

function createApi(_url: string, clientId: string, clientSecret?: string) {
  return function post<ReqBody, ResBody>(
    path: string,
    data: ReqBody,
    options?: RequestInit
  ): Promise<ResBody | null> {
    const url = `${_url}${path}`;
    let timer: ReturnType<typeof setTimeout>;
    const headers: Record<string, string> = {
      'mixan-client-id': clientId,
      'Content-Type': 'application/json',
    };
    if (clientSecret) {
      headers['mixan-client-secret'] = clientSecret;
    }
    return new Promise((resolve) => {
      const wrappedFetch = (attempt: number) => {
        clearTimeout(timer);
        fetch(url, {
          headers,
          method: 'POST',
          body: JSON.stringify(data ?? {}),
          keepalive: true,
          ...(options ?? {}),
        })
          .then(async (res) => {
            if (res.status !== 200) {
              return retry(attempt, resolve);
            }

            const response = await res.json();

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
  };
}

export class Mixan<Options extends MixanOptions = MixanOptions> {
  public options: Options;
  private api: ReturnType<typeof createApi>;
  private state: MixanState = {
    properties: {},
  };

  constructor(options: Options) {
    this.options = options;
    this.api = createApi(options.url, options.clientId, options.clientSecret);
  }

  // Public

  public init(properties?: Record<string, unknown>) {
    this.state.properties = properties ?? {};
  }

  // public setUser(payload: Omit<BatchUpdateProfilePayload, 'profileId'>) {
  //   this.batcher.add({
  //     type: 'update_profile',
  //     payload: {
  //       ...payload,
  //       properties: payload.properties ?? {},
  //       profileId: this.state.profileId,
  //     },
  //   });
  // }

  // public increment(name: string, value: number) {
  //   this.batcher.add({
  //     type: 'increment',
  //     payload: {
  //       name,
  //       value,
  //       profileId: this.state.profileId,
  //     },
  //   });
  // }

  // public decrement(name: string, value: number) {
  //   this.batcher.add({
  //     type: 'decrement',
  //     payload: {
  //       name,
  //       value,
  //       profileId: this.state.profileId,
  //     },
  //   });
  // }

  private getProfileId() {
    if (this.state.profileId) {
      return this.state.profileId;
    } else if (this.options.getProfileId) {
      this.state.profileId = this.options.getProfileId() || undefined;
    }
  }

  public async event(name: string, properties?: Record<string, unknown>) {
    const profileId = await this.api<PostEventPayload, string>('/event', {
      name,
      properties: {
        ...this.state.properties,
        ...(properties ?? {}),
      },
      timestamp: this.timestamp(),
      profileId: this.getProfileId(),
    });

    if (this.options.setProfileId && profileId) {
      this.options.setProfileId(profileId);
    }
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
