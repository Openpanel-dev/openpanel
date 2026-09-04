// The Polar webhook (M6-006), `POST /webhook/polar`. V1's Fastify controller
// (apps/api/src/controllers/webhook.controller.ts's `polarWebhook`) stays the
// LIVE route (DELEGATE PATTERN) and delegates to
// subscription.service.ts's `handlePolarWebhookEvent` — the same function
// this route calls.
//
// RAW BYTES, deliberately: `validatePolarEvent` verifies Polar's signature
// over the exact request body, so this handler reads `await request.text()`
// and declares no `body` schema — any parsing (JSON or otherwise) before the
// signature check breaks it. V1 gets the same raw bytes via
// `fastify-raw-body`'s `{ rawBody: true }` route config; this is the Elysia
// equivalent named in ADR-002's plugin substitutions ("raw body → `await
// request.text()` in the one polar webhook handler").
//
// NAMED GAP, same as gsc.routes.ts / import.routes.ts: this route is not yet
// reachable — main.ts does not mount `publicApiRoutes` until a real
// `AppDeps` exists (P3/P4/P8).

import { defineRoutes } from '../../http/define';
import { handlePolarWebhookEvent } from './subscription.service';

export const subscriptionRoutes = defineRoutes((app) =>
  app.post('/webhook/polar', async ({ request, ctx, status }) => {
    const rawBody = await request.text();
    const headers = Object.fromEntries(request.headers);

    try {
      await handlePolarWebhookEvent(rawBody, headers, ctx.logger);
    } catch {
      return status(500, 'Error');
    }

    return status(202, 'OK');
  })
);
