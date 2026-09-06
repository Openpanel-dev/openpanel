// The GSC OAuth callback (M5-002). V1's Fastify controller
// (apps/api/src/controllers/gsc-oauth-callback.controller.ts) stays the LIVE
// route (DELEGATE PATTERN) and delegates its token-exchange/upsert logic to
// gsc.service.ts's `completeGscOAuthCallback` — the same function this route
// calls. This route is not yet reachable: main.ts does not mount
// `dashboardRoutes` until a real `AppDeps` exists (P3/P4/P8).
//
// NAMED GAP: per-route cookie signing is not wired yet (http/context.ts:147
// — "app.ts lists the signed names (P3)"), so `ctx.cookies.get()` here reads
// the raw, unsigned cookie value. V1's Fastify controller still verifies the
// signature; this route only re-checks the state match, and should not be
// treated as a signature-verified equivalent until that wiring lands.

import { redirect } from 'elysia';
import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { completeGscOAuthCallback } from './gsc.service';

const gscCallbackQuery = z.object({
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

export const gscRoutes = defineRoutes((app) =>
  app.get(
    '/gsc/callback',
    async ({ query, ctx }) => {
      const storedState = ctx.cookies.get('gsc_oauth_state');
      const codeVerifier = ctx.cookies.get('gsc_code_verifier');
      const projectId = ctx.cookies.get('gsc_project_id');

      if (!(storedState && codeVerifier && projectId)) {
        return loginErrorRedirect('Missing GSC OAuth cookies');
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
          `${dashboardUrl()}/${organizationId}/${projectId}/settings/gsc`
        );
      } catch (error) {
        ctx.logger.error({ err: error }, 'GSC OAuth callback error');
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to connect Google Search Console';
        return loginErrorRedirect(message);
      }
    },
    { query: gscCallbackQuery, detail: { hide: true } }
  )
);
