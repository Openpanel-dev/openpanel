export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type MixanJson = Record<string, any>;

// Deprecated
export interface EventPayload {
  name: string;
  time: string;
  profileId: string | null;
  properties: MixanJson;
}

// Deprecated
export interface ProfilePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  id?: string;
  properties?: MixanJson;
}

export type BatchPayload =
  | {
      type: 'increment';
      payload: BatchProfileIncrementPayload;
    }
  | {
      type: 'decrement';
      payload: BatchProfileDecrementPayload;
    }
  | {
      type: 'event';
      payload: BatchEventPayload;
    }
  | {
      type: 'create_profile';
      payload: BatchCreateProfilePayload;
    }
  | {
      type: 'update_profile';
      payload: BatchUpdateProfilePayload;
    }
  | {
      type: 'update_session';
      payload: BatchUpdateSessionPayload;
    }
  | {
      type: 'set_profile_property';
      payload: BatchSetProfilePropertyPayload;
    };

export interface BatchSetProfilePropertyPayload {
  profileId: string;
  name: string;
  value: any;
  update: boolean;
}

export interface CreateProfileResponse {
  id: string;
}

export interface BatchCreateProfilePayload {
  profileId: string;
  properties?: MixanJson;
}

export interface BatchUpdateSessionPayload {
  profileId: string;
  properties?: MixanJson;
}

export interface BatchEventPayload {
  name: string;
  time: string;
  profileId: string;
  properties: MixanJson;
}

export interface BatchUpdateProfilePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  id?: string;
  properties?: MixanJson;
  profileId: string;
}

export interface ProfileIncrementPayload {
  name: string;
  value: number;
  profileId: string;
}

export interface ProfileDecrementPayload {
  name: string;
  value: number;
  profileId: string;
}

export interface BatchProfileIncrementPayload {
  name: string;
  value: number;
  profileId: string;
}

export interface BatchProfileDecrementPayload {
  name: string;
  value: number;
  profileId: string;
}

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

// NEW

export interface PostEventPayload {
  name: string;
  timestamp: string;
  profileId?: string;
  properties?: Record<string, unknown>;
}
