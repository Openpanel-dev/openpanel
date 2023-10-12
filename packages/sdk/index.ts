import { v4 as uuid } from 'uuid'
import {
  EventPayload,
  MixanErrorResponse,
  MixanResponse,
  ProfilePayload,
} from '@mixan/types'

type MixanOptions = {
  url: string
  clientSecret: string
  batchInterval?: number
  maxBatchSize?: number
  verbose?: boolean
  saveProfileId: (profileId: string) => void,
  getProfileId: () => string | null,
  removeProfileId: () => void,
}

class Fetcher {
  private url: string
  private clientSecret: string
  private logger: (...args: any[]) => void

  constructor(options: MixanOptions) {
    this.url = options.url
    this.clientSecret = options.clientSecret
    this.logger = options.verbose ? console.log : () => {}
  }

  post(
    path: string,
    data: Record<string, any>,
    options: FetchRequestInit = {}
  ) {
    const url = `${this.url}${path}`
    this.logger(`Mixan request: ${url}`, JSON.stringify(data, null, 2))
    return fetch(url, {
      headers: {
        ['mixan-client-secret']: this.clientSecret,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(data),
      ...options,
    })
      .then(async (res) => {
        const response = await res.json<
          MixanErrorResponse | MixanResponse<unknown>
        >()

        if('status' in response && response.status === 'error') {
          this.logger(`Mixan request failed: ${url}`, JSON.stringify(response, null, 2))
          return null
        }
        
        return response
      })
      .catch(() => {
        return null
      })
  }
}

class Batcher<T extends any> {
  queue: T[] = []
  timer?: Timer
  callback: (queue: T[]) => void
  maxBatchSize = 10
  batchInterval = 10000

  constructor(options: MixanOptions, callback: (queue: T[]) => void) {
    this.callback = callback

    if (options.maxBatchSize) {
      this.maxBatchSize = options.maxBatchSize
    }

    if (options.batchInterval) {
      this.batchInterval = options.batchInterval
    }
  }

  add(payload: T) {
    this.queue.push(payload)
    this.flush()
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer)
    }

    if (this.queue.length === 0) {
      return
    }

    if (this.queue.length >= this.maxBatchSize) {
      this.send()
      return
    }

    this.timer = setTimeout(this.send.bind(this), this.batchInterval)
  }

  send() {
    this.callback(this.queue)
    this.queue = []
  }
}

export class Mixan {
  private fetch: Fetcher
  private eventBatcher: Batcher<EventPayload>
  private profileId?: string
  private options: MixanOptions
  private logger: (...args: any[]) => void
  
  constructor(options: MixanOptions) {
    this.logger = options.verbose ? console.log : () => {}
    this.options = options
    this.fetch = new Fetcher(options)
    this.setAnonymousUser()
    this.eventBatcher = new Batcher(options, (queue) => {
      this.fetch.post(
        '/events',
        queue.map((item) => ({
          ...item,
          profileId: item.profileId || this.profileId || null,
        }))
      )
    })
  }

  timestamp() {
    return new Date().toISOString()
  }

  event(name: string, properties: Record<string, any>) {
    this.eventBatcher.add({
      name,
      properties,
      time: this.timestamp(),
      profileId: this.profileId || null,
    })
  }

  private setAnonymousUser() {
    const profileId = this.options.getProfileId()
    if(profileId) {
      this.profileId = profileId
       this.logger('Use existing ID', this.profileId);
    } else {
      this.profileId = uuid()
       this.logger('Create new ID', this.profileId);
      this.options.saveProfileId(this.profileId)
      this.fetch.post('/profiles', {
        id: this.profileId,
        properties: {},
      })
    }
  }

  async setUser(profile: ProfilePayload) {
    await this.fetch.post(`/profiles/${this.profileId}`, profile, {
      method: 'PUT'
    })
  }

  async setUserProperty(name: string, value: any) {
    await this.fetch.post(`/profiles/${this.profileId}`, {
      properties: {
        [name]: value,
      },
    })
  }

  async increment(name: string, value: number = 1) {
    if (!this.profileId) {
      return
    }

    await this.fetch.post(`/profiles/${this.profileId}/increment`, {
      name,
      value,
    }, {
      method: 'PUT'
    })
  }

  async decrement(name: string, value: number = 1) {
    if (!this.profileId) {
      return
    }

    await this.fetch.post(`/profiles/${this.profileId}/decrement`, {
      name,
      value,
    }, {
      method: 'PUT'
    })
  }

  async screenView(route: string, properties?: Record<string, any>) {
    await this.event('screen_view', {
      ...(properties || {}),
      route,
    })
  }

  clear() {
    this.eventBatcher.flush()
    this.options.removeProfileId()
    this.profileId = undefined
  }
}
