// The Slack OAuth callback, `GET /webhook/slack`. Delegates token-exchange
// and upsert logic to integration.service.ts's `completeSlackOAuthCallback`,
// same shape as gsc.routes.ts / auth.routes.ts's OAuth callbacks.

import { redirect } from 'elysia';
import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { completeSlackOAuthCallback } from './integration.service';

const slackCallbackQuery = z.object({
  code: z.string(),
  state: z.string(),
});

/** Only used to make the URL parseable when DASHBOARD_URL is not set. */
const FALLBACK_ORIGIN = 'http://localhost';

function loginErrorRedirect(dashboardUrl: string, message: string) {
  const url = new URL('/login', dashboardUrl || FALLBACK_ORIGIN);
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
            ? `${ctx.config.dashboardUrl}/${organizationId}/${projectId}/integrations/installed`
            : `${ctx.config.dashboardUrl}/${organizationId}`
        );
      } catch (error) {
        ctx.logger.error({ err: error }, 'Slack OAuth callback error');
        const message =
          error instanceof Error ? error.message : 'An error occurred';
        return loginErrorRedirect(ctx.config.dashboardUrl, message);
      }
    },
    { query: slackCallbackQuery, detail: { hide: true } }
  )
);
