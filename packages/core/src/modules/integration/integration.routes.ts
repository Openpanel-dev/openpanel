// The Slack OAuth callback (M6-006), `GET /webhook/slack`. V1's Fastify
// controller (apps/api/src/controllers/webhook.controller.ts's `slackWebhook`)
// stays the LIVE route (DELEGATE PATTERN) and delegates its token-exchange/
// upsert logic to integration.service.ts's `completeSlackOAuthCallback` — the
// same function this route calls, same shape as gsc.routes.ts (M5-002) /
// auth.routes.ts (M6-003).
//
// NAMED GAP, same as those two: this route is not yet reachable — main.ts
// does not mount `publicApiRoutes` until a real `AppDeps` exists (P3/P4/P8).
// V1's controller also renders an HTML error page from a local `error.html`
// file on failure; this route redirects to `/login?error=...` instead (same
// simplification gsc.routes.ts/auth.routes.ts already made for their own
// OAuth callbacks) since it serves no traffic yet.

import { redirect } from 'elysia';
import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { completeSlackOAuthCallback } from './integration.service';

const slackCallbackQuery = z.object({
  code: z.string(),
  state: z.string(),
});

function dashboardUrl(): string {
  return (
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || ''
  );
}

function loginErrorRedirect(message: string) {
  const url = new URL('/login', dashboardUrl() || 'http://localhost');
  url.searchParams.set('error', message);
  return redirect(url.toString());
}

export const integrationRoutes = defineRoutes((app) =>
  app.get(
    '/webhook/slack',
    async ({ query, ctx }) => {
      try {
        const { organizationId, projectId } = await completeSlackOAuthCallback(
          ctx,
          query
        );

        // Integrations are project-scoped; the org-level integrations route no
        // longer exists. Newer installs carry projectId in their metadata.
        // Older in-flight installs (started before the project-scoped routes
        // shipped) may lack it — fall back to the org landing page rather
        // than a now-404 integrations URL.
        return redirect(
          projectId
            ? `${dashboardUrl()}/${organizationId}/${projectId}/integrations/installed`
            : `${dashboardUrl()}/${organizationId}`
        );
      } catch (error) {
        ctx.logger.error({ err: error }, 'Slack OAuth callback error');
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return loginErrorRedirect(message);
      }
    },
    { query: slackCallbackQuery, detail: { hide: true } }
  )
);
