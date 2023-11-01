import { v4 as uuid } from 'uuid'
import {
  EventPayload,
  MixanErrorResponse,
  MixanResponse,
  ProfilePayload,
} from '@mixan/types'

type MixanOptions = {
  url: string
  clientId: string
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
  private clientId: string
  private clientSecret: string
  private logger: (...args: any[]) => void

  constructor(options: MixanOptions) {
    this.url = options.url
    this.clientId = options.clientId
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
        ['mixan-client-id']: this.clientId,
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
          this.logger(`Mixan request failed: [${options.method || 'POST'}] ${url}`, JSON.stringify(response, null, 2))
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
    if(this.timer) {
      clearTimeout(this.timer)
    }

    if(this.queue.length > 0) {
      this.callback(this.queue)
      this.queue = []
    }
  }
}

export class Mixan {
  private fetch: Fetcher
  private eventBatcher: Batcher<EventPayload>
  private profileId?: string
  private options: MixanOptions
  private logger: (...args: any[]) => void
  private globalProperties: Record<string, any> = {}
  private lastScreenViewAt?: string
  
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
          profileId: item.profileId || this.profileId || null,
        }))
      )
    })
  }

  timestamp() {
    return new Date().toISOString()
  }

  event(name: string, properties: Record<string, any>) {
    this.logger('Mixan: Queue event', name)
    this.eventBatcher.add({
      name,
      properties: {
        ...this.globalProperties,
        ...properties,
      },
      time: this.timestamp(),
      profileId: this.profileId || null,
    })
  }

  private setAnonymousUser() {
    const profileId = this.options.getProfileId()
    if(profileId) {
      this.profileId = profileId
      this.logger('Mixan: Use existing ID', this.profileId);
    } else {
      this.profileId = uuid()
      this.logger('Mixan: Create new ID', this.profileId);
      this.options.saveProfileId(this.profileId)
      this.fetch.post('/profiles', {
        id: this.profileId,
        properties: {},
      })
    }
  }

  async setUser(profile: ProfilePayload) {
    if(!this.profileId) {
      return this.logger('Mixan: Set user failed, no profileId');
    }
    this.logger('Mixan: Set user', profile);
    await this.fetch.post(`/profiles/${this.profileId}`, profile, {
      method: 'PUT'
    })
  }

  async setUserProperty(name: string, value: any) {
    if(!this.profileId) {
      return this.logger('Mixan: Set user property, no profileId');
    }
    this.logger('Mixan: Set user property', name, value);
    await this.fetch.post(`/profiles/${this.profileId}`, {
      properties: {
        [name]: value,
      },
    })
  }

  async setGlobalProperties(properties: Record<string, any>) {
    this.logger('Mixan: Set global properties', properties);
    this.globalProperties = properties ?? {}
  }

  async increment(name: string, value: number = 1) {
    if (!this.profileId) {
      this.logger('Mixan: Increment failed, no profileId');
      return
    }

    this.logger('Mixan: Increment user property', name, value);
    await this.fetch.post(`/profiles/${this.profileId}/increment`, {
      name,
      value,
    }, {
      method: 'PUT'
    })
  }

  async decrement(name: string, value: number = 1) {
    if (!this.profileId) {
      this.logger('Mixan: Decrement failed, no profileId');
      return
    }

    this.logger('Mixan: Decrement user property', name, value);
    await this.fetch.post(`/profiles/${this.profileId}/decrement`, {
      name,
      value,
    }, {
      method: 'PUT'
    })
  }

  async screenView(route: string, _properties?: Record<string, any>) {
    const properties = _properties ?? {}
    const now = new Date()
    
    if(this.lastScreenViewAt) {
      const last = new Date(this.lastScreenViewAt)
      const diff = now.getTime() - last.getTime()
      this.logger(`Mixan: Screen view duration: ${diff}ms`)
      properties['duration'] = diff
    }
    
    this.lastScreenViewAt = now.toISOString()
    await this.event('screen_view', {
      ...properties,
      route,
    })
  }
  
  flush() {
    this.logger('Mixan: Flushing events queue')
    this.eventBatcher.send()
    this.lastScreenViewAt = undefined
  }

  clear() {
    this.logger('Mixan: Clear, send remaining events and remove profileId');
    this.eventBatcher.send()
    this.options.removeProfileId()
    this.profileId = undefined
    this.setAnonymousUser()
  }
}
