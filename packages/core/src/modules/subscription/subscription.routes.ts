// RAW BYTES, deliberately: `validatePolarEvent` verifies Polar's signature over
// the exact request body, so this handler reads `await request.text` and
// declares no `body` schema — any parsing (JSON or otherwise) before the
// signature check breaks it.
//
// `parse: 'none'` is what makes that possible: Elysia parses the body before
// the handler runs by default, and reading the consumed stream throws "Body
// already used".

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
