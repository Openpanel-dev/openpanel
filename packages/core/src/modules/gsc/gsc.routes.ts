// The GSC OAuth callback. Delegates its token-exchange/upsert logic to
// gsc.service.ts's `completeGscOAuthCallback` — the same function this route
// calls.
//
// Per-route cookie signing is not wired yet, so `ctx.cookies.get` here reads
// the raw, unsigned cookie value; this route only re-checks the state match,
// and should not be treated as a signature-verified equivalent until that
// wiring lands.

import { redirect } from 'elysia';
import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { completeGscOAuthCallback } from './gsc.service';

const gscCallbackQuery = z.object({
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

export const gscRoutes = defineRoutes((app) =>
  app.get(
    '/gsc/callback',
    async ({ query, ctx }) => {
      const storedState = ctx.cookies.get('gsc_oauth_state');
      const codeVerifier = ctx.cookies.get('gsc_code_verifier');
      const projectId = ctx.cookies.get('gsc_project_id');

      if (!(storedState && codeVerifier && projectId)) {
        return loginErrorRedirect(
          ctx.config.dashboardUrl,
          'Missing GSC OAuth cookies'
        );
      }

      try {
        const { organizationId } = await completeGscOAuthCallback(ctx, {
          code: query.code,
          state: query.state,
          storedState,
          codeVerifier,
          projectId,
        });
        return redirect(
          `${ctx.config.dashboardUrl}/${organizationId}/${projectId}/settings/gsc`
        );
      } catch (error) {
        ctx.logger.error({ err: error }, 'GSC OAuth callback error');
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to connect Google Search Console';
        return loginErrorRedirect(ctx.config.dashboardUrl, message);
      }
    },
    { query: gscCallbackQuery, detail: { hide: true } }
  )
);
