import {
  EventPayload,
  MixanErrorResponse,
  MixanIssuesResponse,
  MixanResponse,
  ProfilePayload,
} from '@mixan/types'

type MixanOptions = {
  url: string
  clientSecret: string
  batchInterval?: number
  maxBatchSize?: number
  verbose?: boolean
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

  post(path: string, data: Record<string, any>) {
    const url = `${this.url}${path}`
    this.logger(`Mixan request: ${url}`, JSON.stringify(data, null, 2))
    return fetch(url, {
      headers: {
        ['mixan-client-secret']: this.clientSecret,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(data),
    })
      .then(async (res) => {
        const response = await res.json<
          MixanIssuesResponse | MixanErrorResponse | MixanResponse<unknown>
        >()
        if ('status' in response && response.status === 'ok') {
          return response
        }

        if ('code' in response) {
          this.logger(`Mixan error: [${response.code}] ${response.message}`)
          return null
        }

        if ('issues' in response) {
          this.logger(`Mixan issues:`)
          response.issues.forEach((issue) => {
            this.logger(`  - ${issue.message} (${issue.value})`)
          })

          return null
        }

        return null
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

    if (this.queue.length > this.maxBatchSize) {
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
  private profile: ProfilePayload | null = null

  constructor(options: MixanOptions) {
    this.fetch = new Fetcher(options)
    this.eventBatcher = new Batcher(options, (queue) => {
      this.fetch.post(
        '/events',
        queue.map((item) => ({
          ...item,
          externalId: item.externalId || this.profile?.id,
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
      externalId: this.profile?.id || null,
    })
  }

  async setUser(profile: ProfilePayload) {
    this.profile = profile
    await this.fetch.post('/profiles', profile)
  }

  async setUserProperty(name: string, value: any) {
    await this.fetch.post('/profiles', {
      ...this.profile,
      properties: {
        [name]: value,
      },
    })
  }

  async increment(name: string, value: number = 1) {
    if (!this.profile) {
      return
    }

    await this.fetch.post('/profiles/increment', {
      id: this.profile.id,
      name,
      value,
    })
  }

  async decrement(name: string, value: number = 1) {
    if (!this.profile) {
      return
    }

    await this.fetch.post('/profiles/decrement', {
      id: this.profile.id,
      name,
      value,
    })
  }

  screenView(route: string, properties?: Record<string, any>) {
    this.event('screen_view', {
      ...(properties || {}),
      route,
    })
  }
}
