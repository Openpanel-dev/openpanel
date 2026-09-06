// The github/google OAuth callbacks (M6-003). V1's Fastify controller
// (apps/api/src/controllers/oauth-callback.controller.tsx) stays the LIVE
// route (DELEGATE PATTERN) and delegates its token-exchange/session logic to
// auth.service.ts's `completeOAuthCallback` — the same function this route
// calls, same shape as gsc.routes.ts (M5-002). This route is not yet
// reachable: main.ts does not mount `dashboardRoutes` until a real `AppDeps`
// exists (P3/P4/P8).
//
// NAMED GAP: per-route cookie signing is not wired yet (gsc.routes.ts's
// header names the same gap), so `ctx.cookies.get()` here reads the raw,
// unsigned cookie value. V1's Fastify controller does not sign these cookies
// either (only the GSC flow does), so this is not a parity regression.

import { redirect } from 'elysia';
import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import {
  assertOAuthState,
  completeOAuthCallback,
  fetchGithubOAuthUser,
  fetchGoogleOAuthUser,
  OAuthCallbackError,
} from './auth.service';

const callbackQuery = z.object({
  code: z.string(),
  state: z.string(),
});

function dashboardUrl(): string {
  return (
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || ''
  );
}

function loginErrorRedirect(message: string, correlationId: string) {
  const url = new URL('/login', dashboardUrl() || 'http://localhost');
  url.searchParams.set('error', message);
  url.searchParams.set('correlationId', correlationId);
  return redirect(url.toString());
}

export const authRoutes = defineRoutes((app) =>
  app
    .get(
      '/oauth/github/callback',
      async ({ query, ctx }) => {
        const storedState = ctx.cookies.get('github_oauth_state') ?? null;
        const inviteId = ctx.cookies.get('inviteId');

        try {
          assertOAuthState('github', query.state, storedState);
          const oauthUser = await fetchGithubOAuthUser(query.code);
          await completeOAuthCallback(ctx, {
            provider: 'github',
            oauthUser,
            inviteId,
            setCookie: ctx.setCookie,
            logger: ctx.logger,
          });
          ctx.setCookie('github_oauth_state', '', { maxAge: 0 });
          return redirect(dashboardUrl());
        } catch (error) {
          ctx.logger.error({ err: error }, 'GitHub OAuth callback error');
          ctx.setCookie('github_oauth_state', '', { maxAge: 0 });
          const message =
            error instanceof OAuthCallbackError
              ? error.message
              : 'An error occurred';
          return loginErrorRedirect(message, ctx.requestId);
        }
      },
      { query: callbackQuery, detail: { hide: true } }
    )
    .get(
      '/oauth/google/callback',
      async ({ query, ctx }) => {
        const storedState = ctx.cookies.get('google_oauth_state') ?? null;
        const codeVerifier = ctx.cookies.get('google_code_verifier') ?? null;
        const inviteId = ctx.cookies.get('inviteId');

        try {
          assertOAuthState('google', query.state, storedState);
          if (!codeVerifier) {
            throw new OAuthCallbackError('Missing oauth parameters', {
              codeVerifier: false,
            });
          }
          const oauthUser = await fetchGoogleOAuthUser(
            query.code,
            codeVerifier
          );
          await completeOAuthCallback(ctx, {
            provider: 'google',
            oauthUser,
            inviteId,
            setCookie: ctx.setCookie,
            logger: ctx.logger,
          });
          ctx.setCookie('google_oauth_state', '', { maxAge: 0 });
          ctx.setCookie('google_code_verifier', '', { maxAge: 0 });
          return redirect(dashboardUrl());
        } catch (error) {
          ctx.logger.error({ err: error }, 'Google OAuth callback error');
          ctx.setCookie('google_oauth_state', '', { maxAge: 0 });
          ctx.setCookie('google_code_verifier', '', { maxAge: 0 });
          const message =
            error instanceof OAuthCallbackError
              ? error.message
              : 'An error occurred';
          return loginErrorRedirect(message, ctx.requestId);
        }
      },
      { query: callbackQuery, detail: { hide: true } }
    )
);
