import { z } from 'zod';

import { RESERVED_EVENT_NAMES } from '@openpanel/constants';

export const zTrackPayload = z
  .object({
    name: z.string().min(1),
    properties: z.record(z.unknown()).optional(),
    profileId: z.string().optional(),
  })
  .refine((data) => !RESERVED_EVENT_NAMES.includes(data.name as any), {
    message: `Event name cannot be one of the reserved names: ${RESERVED_EVENT_NAMES.join(', ')}`,
    path: ['name'],
  });

export const zIdentifyPayload = z.object({
  profileId: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  avatar: z.string().url().optional(),
  properties: z.record(z.unknown()).optional(),
});

export const zIncrementPayload = z.object({
  profileId: z.string().min(1),
  property: z.string().min(1),
  value: z.number().positive().optional(),
});

export const zDecrementPayload = z.object({
  profileId: z.string().min(1),
  property: z.string().min(1),
  value: z.number().positive().optional(),
});

export const zAliasPayload = z.object({
  profileId: z.string().min(1),
  alias: z.string().min(1),
});

export const zTrackHandlerPayload = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('track'),
    payload: zTrackPayload,
  }),
  z.object({
    type: z.literal('identify'),
    payload: zIdentifyPayload,
  }),
  z.object({
    type: z.literal('increment'),
    payload: zIncrementPayload,
  }),
  z.object({
    type: z.literal('decrement'),
    payload: zDecrementPayload,
  }),
  z.object({
    type: z.literal('alias'),
    payload: zAliasPayload,
  }),
]);

export type ITrackPayload = z.infer<typeof zTrackPayload>;
export type IIdentifyPayload = z.infer<typeof zIdentifyPayload>;
export type IIncrementPayload = z.infer<typeof zIncrementPayload>;
export type IDecrementPayload = z.infer<typeof zDecrementPayload>;
export type IAliasPayload = z.infer<typeof zAliasPayload>;
export type ITrackHandlerPayload = z.infer<typeof zTrackHandlerPayload>;

// Deprecated types for beta version of the SDKs

export interface DeprecatedOpenpanelEventOptions {
  profileId?: string;
}

export interface DeprecatedPostEventPayload {
  name: string;
  timestamp: string;
  profileId?: string;
  properties?: Record<string, unknown> & DeprecatedOpenpanelEventOptions;
}

export interface DeprecatedUpdateProfilePayload {
  profileId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  properties?: Record<string, unknown>;
}

export interface DeprecatedIncrementProfilePayload {
  profileId: string;
  property: string;
  value: number;
}

export interface DeprecatedDecrementProfilePayload {
  profileId?: string;
  property: string;
  value: number;
}
