export type MixanJson = Record<string, any>

export type EventPayload = {
  name: string
  time: string
  externalId: string | null
  properties: MixanJson
}

export type ProfilePayload = {
  first_name?: string
  last_name?: string
  email?: string
  avatar?: string
  id: string
  properties: MixanJson
}

export type ProfileIncrementPayload = {
  name: string
  value: number
  id: string
}

export type ProfileDecrementPayload = {
  name: string
  value: number
  id: string
}

// Batching
export type BatchEvent = {
  type: 'event',
  payload: EventPayload
}

export type BatchProfile = {
  type: 'profile',
  payload: ProfilePayload
}

export type BatchProfileIncrement = {
  type: 'profile_increment',
  payload: ProfileIncrementPayload
}

export type BatchProfileDecrement = {
  type: 'profile_decrement',
  payload: ProfileDecrementPayload
}

export type BatchItem = BatchEvent | BatchProfile | BatchProfileIncrement | BatchProfileDecrement
export type BatchPayload = Array<BatchItem>


export type MixanIssue = {
  field: string
  message: string
  value: any
}

export type MixanIssuesResponse = {
  issues: Array<MixanIssue>,
}

export type MixanErrorResponse = {
  code: string
  message: string
}

export type MixanResponse<T> = {
  result: T
  status: 'ok'
}