export * from './src/index';

// Deprecated types for beta version of the SDKs
// Still used in api/event.controller.ts and api/profile.controller.ts

export interface OpenpanelEventOptions {
  profileId?: string;
}

export interface PostEventPayload {
  name: string;
  timestamp: string;
  profileId?: string;
  properties?: Record<string, unknown> & OpenpanelEventOptions;
}

export interface UpdateProfilePayload {
  profileId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  properties?: Record<string, unknown>;
}

export interface IncrementProfilePayload {
  profileId: string;
  property: string;
  value: number;
}

export interface DecrementProfilePayload {
  profileId?: string;
  property: string;
  value: number;
}
