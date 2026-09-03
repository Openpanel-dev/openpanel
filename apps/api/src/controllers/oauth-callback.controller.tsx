// Dissolved into @openpanel/core's auth module (M6-003): the github/google
// token exchange, state validation, and account find-or-create/session-issue
// logic moved to packages/core/src/modules/auth/auth.service.ts. This
// controller stays (DELEGATE PATTERN) — it keeps Fastify's cookie reads and
// the redirect shape, and delegates everything else, same as
// gsc-oauth-callback.controller.ts (M5-002).
import {
  assertOAuthState,
  completeOAuthCallback,
  fetchGithubOAuthUser,
  fetchGoogleOAuthUser,
  OAuthCallbackError,
} from '@openpanel/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LogError } from '@/utils/errors';

const callbackQuery = z.object({
  code: z.string(),
  state: z.string(),
});

function parseCallbackQuery(
  req: FastifyRequest,
  provider: 'github' | 'google'
) {
  const query = callbackQuery.safeParse(req.query);
  if (!query.success) {
    throw new LogError('Invalid callback query params', {
      error: query.error,
      query: req.query,
      provider,
    });
  }
  return query.data;
}

export async function githubCallback(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { code, state } = parseCallbackQuery(req, 'github');
    const storedState = req.cookies.github_oauth_state ?? null;
    const inviteId = req.cookies.inviteId;

    assertOAuthState('github', state, storedState);
    const oauthUser = await fetchGithubOAuthUser(code);

    await completeOAuthCallback({
      provider: 'github',
      oauthUser,
      inviteId,
      setCookie: (...args) => reply.setCookie(...args),
      logger: req.log,
    });

    reply.clearCookie('github_oauth_state');
    return reply.redirect(
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!
    );
  } catch (error) {
    req.log.error(error);
    reply.clearCookie('github_oauth_state');
    return redirectWithError(reply, error);
  }
}

export async function googleCallback(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { code, state } = parseCallbackQuery(req, 'google');
    const storedState = req.cookies.google_oauth_state ?? null;
    const codeVerifier = req.cookies.google_code_verifier ?? null;
    const inviteId = req.cookies.inviteId;

    assertOAuthState('google', state, storedState);
    if (!codeVerifier) {
      throw new OAuthCallbackError('Missing oauth parameters', {
        codeVerifier: false,
      });
    }
    const oauthUser = await fetchGoogleOAuthUser(code, codeVerifier);

    await completeOAuthCallback({
      provider: 'google',
      oauthUser,
      inviteId,
      setCookie: (...args) => reply.setCookie(...args),
      logger: req.log,
    });

    reply.clearCookie('google_code_verifier');
    reply.clearCookie('google_oauth_state');
    return reply.redirect(
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!
    );
  } catch (error) {
    req.log.error(error);
    reply.clearCookie('google_code_verifier');
    reply.clearCookie('google_oauth_state');
    return redirectWithError(reply, error);
  }
}

function redirectWithError(reply: FastifyReply, error: unknown) {
  const url = new URL(
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!
  );
  url.pathname = '/login';
  if (error instanceof LogError || error instanceof OAuthCallbackError) {
    url.searchParams.set('error', error.message);
  } else {
    url.searchParams.set('error', 'An error occurred');
  }
  url.searchParams.set('correlationId', reply.request.id);
  return reply.redirect(url.toString());
}
