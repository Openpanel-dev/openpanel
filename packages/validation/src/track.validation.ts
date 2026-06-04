import { RESERVED_EVENT_NAMES } from '@openpanel/constants';
import { z } from 'zod';
import { isBlockedEventName } from './event-blocklist';

// ----- Hand-written types (source of truth) -----
//
// These interfaces are duplicated in code that ships in our SDK type
// declarations. We hand-write them (instead of using `z.infer<…>`) so:
//   1. Generated `.d.ts` files for the SDKs are readable plain TypeScript
//      with no `import type { ITrackPayload } from '@openpanel/validation'`
//      lines (the package isn't published).
//   2. The interfaces stay clean — no zod internals leaking through.
// Each schema below has `satisfies z.ZodType<…>` attached so a drift
// between the interface and the schema fails to compile.

export type IProfileId = string | number;

export interface IGroupPayload {
  id: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
}

export interface IAssignGroupPayload {
  groupIds: string[];
  profileId?: IProfileId;
}

export interface ITrackPayload {
  name: string;
  properties?: Record<string, unknown>;
  profileId?: IProfileId;
  groups?: string[] | null;
}

export interface IIdentifyPayload {
  profileId: IProfileId;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  properties?: Record<string, unknown>;
}

export interface IIncrementPayload {
  profileId: IProfileId;
  property: string;
  value?: number;
}

export interface IDecrementPayload {
  profileId: IProfileId;
  property: string;
  value?: number;
}

export interface IAliasPayload {
  profileId: IProfileId;
  alias: string;
}

export interface IReplayPayload {
  chunk_index: number;
  events_count: number;
  is_full_snapshot: boolean;
  started_at: string;
  ended_at: string;
  payload: string;
}

export type ITrackHandlerPayload =
  | { type: 'track'; payload: ITrackPayload }
  | { type: 'identify'; payload: IIdentifyPayload }
  | { type: 'increment'; payload: IIncrementPayload }
  | { type: 'decrement'; payload: IDecrementPayload }
  | { type: 'alias'; payload: IAliasPayload }
  | { type: 'replay'; payload: IReplayPayload }
  | { type: 'group'; payload: IGroupPayload }
  | { type: 'assign_group'; payload: IAssignGroupPayload };

// ----- Schemas (each `satisfies` its hand-written interface) -----

export const zProfileId = z.union([
  z.string().min(1),
  z.number(),
]) satisfies z.ZodType<IProfileId>;

export const zGroupPayload = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<IGroupPayload>;

export const zAssignGroupPayload = z.object({
  groupIds: z.array(z.string().min(1)),
  profileId: zProfileId.optional(),
}) satisfies z.ZodType<IAssignGroupPayload>;

export const zTrackPayload = z
  .object({
    name: z.string().min(1),
    properties: z.record(z.string(), z.unknown()).optional(),
    profileId: zProfileId.optional(),
    groups: z.array(z.string().min(1)).nullish(),
  })
  .refine((data) => !RESERVED_EVENT_NAMES.includes(data.name as any), {
    message: `Event name cannot be one of the reserved names: ${RESERVED_EVENT_NAMES.join(', ')}`,
    path: ['name'],
  })
  .refine((data) => !isBlockedEventName(data.name), {
    message: 'Event name contains blocked content',
    path: ['name'],
  })
  .refine(
    (data) => {
      if (data.name !== 'revenue') {
        return true;
      }
      const revenue = data.properties?.__revenue;
      if (revenue === undefined || revenue === null) {
        return true;
      }
      const isInt = Number.isInteger(revenue);
      if (isInt && Number(revenue) < 0) {
        return false;
      }
      return isInt;
    },
    {
      message: '__revenue must be an integer (no floats or strings)',
      path: ['properties', '__revenue'],
    }
  ) satisfies z.ZodType<ITrackPayload>;

export const zIdentifyPayload = z.object({
  profileId: zProfileId,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  avatar: z.string().url().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<IIdentifyPayload>;

export const zIncrementPayload = z.object({
  profileId: zProfileId,
  property: z.string().min(1),
  value: z.number().positive().optional(),
}) satisfies z.ZodType<IIncrementPayload>;

export const zDecrementPayload = z.object({
  profileId: zProfileId,
  property: z.string().min(1),
  value: z.number().positive().optional(),
}) satisfies z.ZodType<IDecrementPayload>;

export const zAliasPayload = z.object({
  profileId: zProfileId,
  alias: z.string().min(1),
}) satisfies z.ZodType<IAliasPayload>;

export const zReplayPayload = z.object({
  chunk_index: z.number().int().min(0).max(65_535),
  events_count: z.number().int().min(1),
  is_full_snapshot: z.boolean(),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime(),
  payload: z.string().max(1_048_576 * 2), // 2MB max
}) satisfies z.ZodType<IReplayPayload>;

export const zTrackHandlerPayload = z.discriminatedUnion('type', [
  z
    .object({
      type: z.enum(['track']),
      payload: zTrackPayload,
    })
    .meta({ title: 'Track' }),
  z
    .object({
      type: z.enum(['identify']),
      payload: zIdentifyPayload,
    })
    .meta({ title: 'Identify' }),
  z
    .object({
      type: z.enum(['increment']),
      payload: zIncrementPayload,
    })
    .meta({ title: 'Increment' }),
  z
    .object({
      type: z.enum(['decrement']),
      payload: zDecrementPayload,
    })
    .meta({ title: 'Decrement' }),
  z
    .object({
      type: z.enum(['alias']),
      payload: zAliasPayload,
    })
    .meta({ title: 'Alias' }),
  z
    .object({
      type: z.enum(['replay']),
      payload: zReplayPayload,
    })
    .meta({ title: 'Replay' }),
  z
    .object({
      type: z.enum(['group']),
      payload: zGroupPayload,
    })
    .meta({ title: 'Group' }),
  z
    .object({
      type: z.enum(['assign_group']),
      payload: zAssignGroupPayload,
    })
    .meta({ title: 'Assign Group' }),
]) satisfies z.ZodType<ITrackHandlerPayload>;

// Batch ingestion: `POST /track` with `{ type: 'batch', payload: [...] }`.
// The envelope is validated strictly (array length only); per-event validation
// runs inside the controller via `safeParse(zTrackHandlerPayload)` so invalid
// items can be rejected per-index without failing the whole batch.
//
// Per-request caps: up to 2000 events and 10 MB uncompressed body.
export const TRACK_BATCH_MAX_EVENTS = 2000;

export const zTrackBatchHandlerPayload = z
  .object({
    type: z.literal('batch'),
    payload: z.array(z.unknown()).min(1).max(TRACK_BATCH_MAX_EVENTS),
  })
  .meta({ title: 'Batch' });

export type ITrackBatchHandlerPayload = z.infer<
  typeof zTrackBatchHandlerPayload
>;

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
