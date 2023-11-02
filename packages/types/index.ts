export type MixanJson = Record<string, any>;

export interface EventPayload {
  name: string;
  time: string;
  profileId: string | null;
  properties: MixanJson;
}

export interface ProfilePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  id?: string;
  properties?: MixanJson;
}

export interface ProfileIncrementPayload {
  name: string;
  value: number;
  id: string;
}

export interface ProfileDecrementPayload {
  name: string;
  value: number;
  id: string;
}

// Batching
export interface BatchEvent {
  type: 'event';
  payload: EventPayload;
}

export interface BatchProfile {
  type: 'profile';
  payload: ProfilePayload;
}

export interface BatchProfileIncrement {
  type: 'profile_increment';
  payload: ProfileIncrementPayload;
}

export interface BatchProfileDecrement {
  type: 'profile_decrement';
  payload: ProfileDecrementPayload;
}

export type BatchItem =
  | BatchEvent
  | BatchProfile
  | BatchProfileIncrement
  | BatchProfileDecrement;
export type BatchPayload = BatchItem[];

export interface MixanIssue {
  field: string;
  message: string;
  value: any;
}

export interface MixanErrorResponse {
  status: 'error';
  code: number;
  message: string;
  issues?: MixanIssue[] | undefined;
  stack?: string | undefined;
}

export interface MixanResponse<T> {
  result: T;
  status: 'ok';
}
