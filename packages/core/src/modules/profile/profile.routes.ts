// Ported from apps/api/src/routes/profile.router.ts +
// apps/api/src/controllers/profile.controller.ts (M7-002). V1's Fastify
// controller stays the LIVE route (DELEGATE PATTERN) and delegates its bodies
// to profile.service.ts's `identifyProfile` / `adjustProfileProperty` — the
// same functions these routes call. Status codes and text bodies (`202` +
// profile id, `400 'No projectId'`, `404 'Not found'`, `400 'Not number'`)
// match V1's `reply.status(..).send(..)` byte for byte.
//
// `ingest` is V1's `clientHook` (the SDK credential rules); V1's `isBotHook`
// and `subscriptionHook` on this router live in the ingest module, not this
// one.
//
// V1 has no request-body schema for these routes (ADR-003: "/profile, /import,
// /event and /tools have no request schemas today, and adding them would be a
// behaviour change"), so the bodies are typed but not shape-validated.

import { parseUserAgent } from '@openpanel/shared/server';
import { getGeoLocation } from '../../clients/geo';
import { defineRoutes } from '../../http/define';
import { validateIngestRequest } from '../ingest/src/client-auth';
import {
  type AdjustProfilePropertyResult,
  adjustProfileProperty,
  type IdentifyProfileInput,
  identifyProfile,
} from './profile.service';

const TAGS = ['Profile'];

interface AdjustPropertyBody {
  profileId: string;
  property: string;
  value: number;
}

type StatusFn = (code: 400 | 404, body: string) => unknown;

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
        const { profileId, property, value } = body as AdjustPropertyBody;
        const result = await adjustProfileProperty(ctx, client.projectId, {
          profileId,
          property,
          delta: value,
        });
        return respondAdjusted(result, status, set);
      },
      {
        clientAuth: { ingest: validateIngestRequest },
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
        const { profileId, property, value } = body as AdjustPropertyBody;
        const result = await adjustProfileProperty(ctx, client.projectId, {
          profileId,
          property,
          delta: -value,
        });
        return respondAdjusted(result, status, set);
      },
      {
        clientAuth: { ingest: validateIngestRequest },
        detail: {
          tags: TAGS,
          description: 'Decrement a numeric property on a user profile.',
        },
      }
    )
);
