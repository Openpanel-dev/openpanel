// `clientAuth: { ingest: ... }` enforces the SDK credential rules. Bot
// filtering and subscription-limit checks for this router live in the
// ingest module, not this one.
//
// /profile has no request-body schema, so `payload` below is typed but not
// shape-validated at the boundary — unlike /profile/increment and
// /profile/decrement, which validate via `zAdjustProperty`.

import { parseUserAgent } from '@openpanel/shared/server';
import { z } from 'zod';
import { getGeoLocation } from '../../clients/geo';
import { defineRoutes } from '../../http/define';
import { zProfileId } from '../ingest/ingest.constants';
import { validateIngestRequest } from '../ingest/src/client-auth';
import {
  type AdjustProfilePropertyResult,
  adjustProfileProperty,
  type IdentifyProfileInput,
  identifyProfile,
} from './profile.service';

const TAGS = ['Profile'];

type StatusFn = (code: 400 | 404, body: string) => unknown;

/**
 * Deliberately NOT `zIncrementPayload` from ingest.constants: that schema is
 * `/track`'s, where `value` is optional and must be positive. This route has
 * always accepted a negative delta and has always needed a value — without
 * one the service writes NaN. So the schema below is exactly as permissive as
 * the paths that work today, and rejects only the bodies that reached
 * `input.property.split` and answered 500.
 */
const zAdjustProperty = z.object({
  profileId: zProfileId,
  property: z.string().min(1),
  value: z.number(),
});

function respondAdjusted(
  result: AdjustProfilePropertyResult,
  status: StatusFn,
  set: { status?: number | string }
) {
  if (result.status === 'not-found') {
    return status(404, 'Not found');
  }
  if (result.status === 'not-a-number') {
    return status(400, 'Not number');
  }
  set.status = 202;
  return result.profileId;
}

export const profileRoutes = defineRoutes((app) =>
  app
    .post(
      '/profile',
      async ({ body, client, ctx, status, set }) => {
        if (!client.projectId) {
          return status(400, 'No projectId');
        }
        if (body === null || body === undefined) {
          return status(400, 'Missing body');
        }
        const payload = body as IdentifyProfileInput;
        const userAgent = parseUserAgent(
          ctx.headers.get('user-agent'),
          payload.properties
        );
        const geo = await getGeoLocation(ctx.ip);
        await identifyProfile(ctx, client.projectId, payload, {
          geo,
          userAgent,
        });
        set.status = 202;
        return payload.profileId;
      },
      {
        clientAuth: { ingest: validateIngestRequest },
        detail: {
          tags: TAGS,
          description: 'Identify or update a user profile.',
        },
      }
    )
    .post(
      '/profile/increment',
      async ({ body, client, ctx, status, set }) => {
        if (!client.projectId) {
          return status(400, 'No projectId');
        }
        const { profileId, property, value } = body;
        const result = await adjustProfileProperty(ctx, client.projectId, {
          profileId: String(profileId),
          property,
          delta: value,
        });
        return respondAdjusted(result, status, set);
      },
      {
        clientAuth: { ingest: validateIngestRequest },
        body: zAdjustProperty,
        detail: {
          tags: TAGS,
          description: 'Increment a numeric property on a user profile.',
        },
      }
    )
    .post(
      '/profile/decrement',
      async ({ body, client, ctx, status, set }) => {
        if (!client.projectId) {
          return status(400, 'No projectId');
        }
        const { profileId, property, value } = body;
        const result = await adjustProfileProperty(ctx, client.projectId, {
          profileId: String(profileId),
          property,
          delta: -value,
        });
        return respondAdjusted(result, status, set);
      },
      {
        clientAuth: { ingest: validateIngestRequest },
        body: zAdjustProperty,
        detail: {
          tags: TAGS,
          description: 'Decrement a numeric property on a user profile.',
        },
      }
    )
);
