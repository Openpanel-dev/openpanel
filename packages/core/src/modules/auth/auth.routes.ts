// The github/google OAuth callbacks, same shape as gsc.routes.ts:
// token-exchange/session logic lives in auth.service.ts's
// `completeOAuthCallback`. `main.ts` mounts `dashboardRoutes` unconditionally
// on every HTTP-serving boot, so this route is live.
//
// Per-route cookie signing is not wired yet (gsc.routes.ts's header names the
// same gap), so `ctx.cookies.get` here reads the raw, unsigned cookie value.

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

/** Only used to make the URL parseable when DASHBOARD_URL is not set. */
const FALLBACK_ORIGIN = 'http://localhost';

function loginErrorRedirect(
  dashboardUrl: string,
  message: string,
  correlationId: string
) {
  const url = new URL('/login', dashboardUrl || FALLBACK_ORIGIN);
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
          const oauthUser = await fetchGithubOAuthUser(ctx.config, query.code);
          await completeOAuthCallback(ctx, {
            provider: 'github',
            oauthUser,
            inviteId,
            setCookie: ctx.setCookie,
            logger: ctx.logger,
          });
          ctx.setCookie('github_oauth_state', '', { maxAge: 0 });
          return redirect(ctx.config.dashboardUrl);
        } catch (error) {
          ctx.logger.error({ err: error }, 'GitHub OAuth callback error');
          ctx.setCookie('github_oauth_state', '', { maxAge: 0 });
          const message =
            error instanceof OAuthCallbackError
              ? error.message
              : 'An error occurred';
          return loginErrorRedirect(
            ctx.config.dashboardUrl,
            message,
            ctx.requestId
          );
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
            ctx.config,
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
          return redirect(ctx.config.dashboardUrl);
        } catch (error) {
          ctx.logger.error({ err: error }, 'Google OAuth callback error');
          ctx.setCookie('google_oauth_state', '', { maxAge: 0 });
          ctx.setCookie('google_code_verifier', '', { maxAge: 0 });
          const message =
            error instanceof OAuthCallbackError
              ? error.message
              : 'An error occurred';
          return loginErrorRedirect(
            ctx.config.dashboardUrl,
            message,
            ctx.requestId
          );
        }
      },
      { query: callbackQuery, detail: { hide: true } }
    )
);
