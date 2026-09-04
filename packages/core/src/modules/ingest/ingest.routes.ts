// Ported from apps/api/src/routes/track.router.ts + track.controller.ts
// (M8-002). V1's Fastify router stays the LIVE route (DELEGATE PATTERN) and
// its controller and hooks delegate into ingest.service.ts — the same
// functions this file calls.
//
// THE HOOK ORDER IS THE CONTRACT (ADR-002 "behaviour that must be preserved
// explicitly" 5): duplicate -> clientAuth -> isBot. Here it holds by
// lifecycle phase rather than by registration luck — measured on Elysia
// 1.4.30, a route declaring all three runs
// `derive -> transform -> macro resolve -> beforeHandle`. So the duplicate
// check is a `transform` (V1's `preValidation`), `clientAuth` is the macro,
// and the bot check is a `beforeHandle`, which is what lets it read
// `client.secretPresented` the way V1's `isBotHook` reads the
// `req.clientSecretAuth` side channel `validateSdkRequest` sets.
//
// Both routes carry the whole chain because V1's `fastify.addHook` calls are
// plugin-scoped, so `GET /track/device-id` goes through it too.
//
// NAMED GAPS, same as profile.routes.ts: not yet reachable — main.ts does not
// mount `publicApiRoutes` until a real `AppDeps` exists. V1's
// `subscriptionHook` (the wind-down gate) is NOT ported here: it belongs to
// the subscription/organization modules and reads `process.env.SELF_HOSTED`,
// which core does not do. It stays live on V1's router.

import type { AppDeps, HttpCtx } from '../../context';
import { defineRoutes } from '../../http/define';
import { zTrackHandlerPayload } from './ingest.constants';
import {
  checkIngestBot,
  fetchDeviceIdentity,
  ingestTrack,
  isDuplicateIngestRequest,
  type TrackOutcome,
} from './ingest.service';
import { toIngestHeaders } from './src/headers';

const TAGS = ['Track'];
const DUPLICATE_BODY = 'Duplicate event';

type StatusFn = (code: number, body?: unknown) => unknown;

// V1's error handler turns each thrown HttpError into this body; core has no
// such handler, so the mapping is explicit and the codes and messages are
// V1's.
function respondToOutcome(outcome: TrackOutcome, status: StatusFn) {
  switch (outcome.status) {
    case 'ok':
      return { deviceId: outcome.deviceId, sessionId: outcome.sessionId };
    case 'alias-not-supported':
      return status(400, {
        status: 400,
        error: 'Bad Request',
        message: 'Alias is not supported',
      });
    case 'invalid-type':
      return status(400, {
        status: 400,
        error: 'Bad Request',
        message: 'Invalid type',
      });
    case 'missing-project-id':
      return status(400, { status: 400, message: 'Missing projectId' });
    case 'replay-missing-session-id':
      return status(400, {
        status: 400,
        message: 'Session ID is required for replay',
      });
    case 'profile-not-found':
      return status(404, { status: 404, message: 'Profile not found' });
    default:
      return status(400, {
        status: 400,
        message: 'Property value is not a number',
      });
  }
}

// V1's `isBotHook`: a `preHandler` registered after `clientHook`, so it can
// read the `clientSecretAuth` side channel. Here it is a route-level
// `beforeHandle`, which runs after the macro resolved the principal.
async function botGuard({
  body,
  client,
  ctx,
  status,
}: {
  body: unknown;
  client: { projectId: string | null; secretPresented: boolean };
  ctx: HttpCtx;
  status: StatusFn;
}) {
  const bot = await checkIngestBot({
    headers: toIngestHeaders(ctx.headers),
    clientSecretAuth: client.secretPresented,
    projectId: client.projectId,
    body,
  });
  if (bot) {
    return status(202, { bot });
  }
}

export const ingestRoutes = defineRoutes((app, deps: AppDeps) =>
  app.guard(
    {
      // V1's `duplicateHook`, registered on `preValidation` so it answers
      // before the client is ever authenticated. A guard hook runs ahead of
      // the `clientAuth` macro's resolve and is scoped to the two routes
      // below — measured on Elysia 1.4.30:
      // derive -> guard beforeHandle -> macro resolve -> route beforeHandle.
      async beforeHandle({ body, ctx, request, status }) {
        if (
          await isDuplicateIngestRequest({
            method: request.method,
            clientIp: ctx.ip,
            headers: toIngestHeaders(ctx.headers),
            body,
          })
        ) {
          return status(200, DUPLICATE_BODY);
        }
      },
    },
    (routes) =>
      routes
        .post(
          '/track',
          async ({ body, client, ctx, status, timestamp }) => {
            const outcome = await ingestTrack(
              {
                projectId: client.projectId,
                clientIp: ctx.ip,
                headers: toIngestHeaders(ctx.headers),
                clientSecretAuth: client.secretPresented,
                timestamp,
                body,
              },
              {
                buffers: ctx.buffers,
                produceIncomingEvent: deps.produceIncomingEvent,
              }
            );

            return respondToOutcome(outcome, status);
          },
          {
            clientAuth: { ingest: true },
            body: zTrackHandlerPayload,
            beforeHandle: botGuard,
            detail: {
              tags: TAGS,
              description:
                'Ingest a tracking event (track, identify, group, increment, decrement, replay).',
            },
          }
        )
        .get(
          '/track/device-id',
          async ({ client, ctx, status }) => {
            const identity = await fetchDeviceIdentity(
              {
                projectId: client.projectId,
                clientIp: ctx.ip,
                headers: toIngestHeaders(ctx.headers),
              },
              ctx.buffers,
              ctx.logger
            );

            switch (identity.status) {
              case 'missing-project-id':
                return status(400, 'No projectId');
              case 'missing-ip':
                return status(400, 'Missing ip address');
              case 'missing-user-agent':
                return status(400, 'Missing header: user-agent');
              default:
                return {
                  deviceId: identity.deviceId,
                  sessionId: identity.sessionId,
                  message: identity.message,
                };
            }
          },
          {
            clientAuth: { ingest: true },
            beforeHandle: botGuard,
            detail: {
              tags: TAGS,
              description:
                'Get or generate a stable device ID and session ID for the current visitor.',
            },
          }
        )
  )
);
