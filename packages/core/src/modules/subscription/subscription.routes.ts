// The Polar webhook (M6-006), `POST /webhook/polar`. Ported from V1's
// apps/api/src/controllers/webhook.controller.ts's `polarWebhook`, which
// doesn't exist in this tree — this route is the only caller of
// subscription.service.ts's `handlePolarWebhookEvent`.
//
// RAW BYTES, deliberately: `validatePolarEvent` verifies Polar's signature
// over the exact request body, so this handler reads `await request.text()`
// and declares no `body` schema — any parsing (JSON or otherwise) before the
// signature check breaks it. V1 gets the same raw bytes via
// `fastify-raw-body`'s `{ rawBody: true }` route config; this is the Elysia
// equivalent named in ADR-002's plugin substitutions ("raw body → `await
// request.text()` in the one polar webhook handler").
//
// `parse: 'none'` is what makes that possible: Elysia parses the body before
// the handler runs by default, and reading the consumed stream throws "Body
// already used" (M9-004, which mounted this surface).

import { defineRoutes } from '../../http/define';

export const subscriptionRoutes = defineRoutes((app) =>
  app.post(
    '/webhook/polar',
    async ({ request, ctx, status }) => {
      const rawBody = await request.text();
      const headers = Object.fromEntries(request.headers);

      try {
        await ctx.services.subscription.handlePolarWebhookEvent(
          rawBody,
          headers,
          ctx.logger
        );
      } catch {
        return status(500, 'Error');
      }

      return status(202, 'OK');
    },
    { parse: 'none' }
  )
);
